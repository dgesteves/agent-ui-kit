'use client';

import * as ToggleGroup from '@radix-ui/react-toggle-group';
import {
  createContext,
  Fragment,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  computeReviewResult,
  DEFAULT_MAX_EDIT_LENGTH,
  parseWithin,
  type DiffHunk,
  type DiffLine,
  type DiffReviewResult,
  type FileChange,
  type HunkDecision,
  type ParsedFileDiff,
} from './lib/diff';
import { defaultDiffWorker, parseInBackground, type DiffWorkerFactory } from './lib/diff-async';
import { mergeTokensWithSegments, TOKEN_CLASS, tokenizeLine } from './lib/highlight';
import { useIsMac } from './lib/hooks';
import { useScrollRegion } from './lib/scroll-region';
import { CheckIcon, UndoIcon, XIcon } from './lib/icons';
import { Kbd, LiveRegion } from './lib/primitives';
import { cn, hasModifier, isPromiseLike, isTypingTarget, type HeadingLevel } from './lib/utils';

export type { DiffReviewFileResult, DiffReviewResult, FileChange, HunkDecision } from './lib/diff';
export type { DiffWorkerFactory } from './lib/diff-async';
export type DiffViewMode = 'unified' | 'split';

export interface DiffReviewProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title' | 'onSubmit' | 'children'> {
  files: readonly FileChange[];
  title?: ReactNode;
  view?: DiffViewMode | undefined;
  defaultView?: DiffViewMode;
  onViewChange?: ((view: DiffViewMode) => void) | undefined;
  /**
   * Controlled decisions keyed by hunk id: `${path}:${index}`. A repeated path gets `${path}#2:${index}`,
   * `#3` and so on, skipping a suffix another file's path already has.
   */
  decisions?: Readonly<Record<string, HunkDecision>> | undefined;
  defaultDecisions?: Readonly<Record<string, HunkDecision>> | undefined;
  onDecisionsChange?: ((decisions: Record<string, HunkDecision>) => void) | undefined;
  /**
   * Called with the reviewed result. Pending hunks are not applied. Fires once per set of decisions,
   * so a double click or a repeated ⌘/Ctrl+Enter sends one review. Submitting again needs a changed
   * decision, changed `files`, the returned promise to settle, or the handler to throw. Files compare
   * by content and decisions by value: an equal new array or object does not count as a change.
   */
  onSubmit?: ((result: DiffReviewResult) => void | PromiseLike<void>) | undefined;
  submitLabel?: string;
  /** Hide review controls, e.g. once the review has been submitted. */
  readOnly?: boolean;
  /** Lines of context around each change. Default 3. */
  context?: number;
  /**
   * Past this many lines added plus lines removed in one file, its changed region (from the first
   * changed line to the last) is shown as one hunk that replaces it, and the review says so. Diffing
   * costs about the square of this number. Default 2,000.
   */
  maxEditLength?: number;
  /**
   * Where files too large to diff while rendering are diffed: by default in the package's own
   * worker, which bundlers with worker support emit (webpack 5 and Next.js, Vite, Parcel). Pass a
   * function that starts your own `Worker` running `signoff-ui`'s diff worker, or `false` to diff
   * them on the main thread after the first paint. Without a working worker the latter is the fallback.
   */
  diffWorker?: DiffWorkerFactory | false;
  /** After accepting or rejecting with the keyboard, move to the next pending hunk. Default `true`. */
  autoAdvance?: boolean;
  /** Heading level for the title, to fit your document outline. Default 3. */
  headingLevel?: HeadingLevel;
}

interface FlatHunk {
  file: ParsedFileDiff;
  hunk: DiffHunk;
  /** Position across all files, 0-based. */
  order: number;
}

const sameChange = (a: FileChange, b: FileChange) =>
  a.path === b.path &&
  a.oldPath === b.oldPath &&
  a.oldContent === b.oldContent &&
  a.newContent === b.newContent &&
  a.patch === b.patch &&
  a.language === b.language;

/** Equal when every hunk has the same decision, counting a missing one as pending. */
function sameDecisions(a: Readonly<Record<string, HunkDecision>>, b: Readonly<Record<string, HunkDecision>>) {
  if (a === b) return true;
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if ((a[id] ?? 'pending') !== (b[id] ?? 'pending')) return false;
  }
  return true;
}

interface ParsedFiles {
  files: readonly FileChange[];
  context: number;
  maxEditLength: number;
  ids: string[];
  /** One per file; `undefined` while the file is diffed in the background. */
  parsed: (ParsedFileDiff | undefined)[];
}

/**
 * A diff that needs at most this many lines added plus removed is computed while rendering, on
 * the server too: at most a few milliseconds. A larger one renders as "Comparing…" until the
 * worker has it. Deterministic, so the server and the hydrating client agree.
 */
const SYNC_EDIT_LENGTH = 300;

/**
 * One id per file: its path, or for a repeated path `path#2`, `path#3`… skipping any id already
 * taken, since a real path can look like a repeat (`a.ts`, `a.ts`, `a.ts#2`).
 */
function fileIds(files: readonly FileChange[]): string[] {
  const used = new Set<string>();
  const next = new Map<string, number>();
  return files.map(({ path }) => {
    let id = path;
    if (used.has(id)) {
      let n = next.get(path) ?? 2;
      while (used.has(`${path}#${n}`)) n++;
      next.set(path, n + 1);
      id = `${path}#${n}`;
    }
    used.add(id);
    return id;
  });
}

/** Parse each change, reusing `previous` parses of unchanged files (diffing is the expensive part). */
function parseFiles(
  files: readonly FileChange[],
  context: number,
  maxEditLength: number,
  previous?: ParsedFiles,
): ParsedFiles {
  // Two changes must not share hunk ids, or deciding one hunk decides the other too.
  const ids = fileIds(files);
  const sameOptions = previous?.context === context && previous.maxEditLength === maxEditLength;
  const parsed = files.map((f, i) => {
    const id = ids[i]!;
    const before = previous?.files[i];
    if (sameOptions && before && previous.ids[i] === id && sameChange(before, f)) return previous.parsed[i];
    return parseWithin(f, { context, id, maxEditLength }, SYNC_EDIT_LENGTH);
  });
  // Keep the previous array when nothing changed, so memoized work downstream is kept too.
  const same = previous && parsed.length === previous.parsed.length && parsed.every((p, i) => p === previous.parsed[i]);
  return { files, context, maxEditLength, ids, parsed: same ? previous.parsed : parsed };
}

const STATUS_BADGE: Record<ParsedFileDiff['status'], { letter: string; label: string; className: string }> = {
  modified: { letter: 'M', label: 'Modified', className: 'border-signoff-warn/40 text-signoff-warn-fg' },
  added: { letter: 'A', label: 'Added', className: 'border-signoff-accent/45 text-signoff-accent-fg' },
  deleted: { letter: 'D', label: 'Deleted', className: 'border-signoff-hot/45 text-signoff-hot-fg' },
  renamed: { letter: 'R', label: 'Renamed', className: 'border-signoff-border-strong text-signoff-fg-muted' },
};

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/*
 * Long reviews render only what is near the screen. Each hunk's rows are cut into chunks; a chunk
 * far from the viewport keeps its height and its lines as visually hidden text, so the page does not
 * jump, find-in-page and screen readers still have every line, and the DOM stays small. Hunks
 * themselves always render: focus, J/K and their names never depend on what is on screen.
 */
/** Reviews with more rows than this are virtualized; smaller ones render every row. */
const VIRTUALIZE_ROWS = 400;
const CHUNK_ROWS = 50;
/** Rendered in full on the first render (and on the server), before anything is measured. */
const INITIAL_ROWS = 100;
/** How far beyond the viewport chunks render, so scrolling rarely meets an empty one. */
const NEAR_MARGIN = '800px 0px';
/** One row of 12.5px text at line-height 1.6, until a rendered row is measured. */
const ROW_HEIGHT = 20;

interface Virtualizer {
  /** Calls `listener` whenever the element comes near the viewport or leaves; returns an unsubscribe. */
  observe(el: Element, listener: (near: boolean, height: number) => void): () => void;
  /** Measured heights of a hunk's chunks that have rendered, by chunk key; a new parse starts afresh. */
  heights: WeakMap<DiffHunk, Map<string, number>>;
  rowHeight: number;
}

function createVirtualizer(rowHeight: number, heights: Virtualizer['heights']): Virtualizer {
  let observer: IntersectionObserver | undefined;
  const listeners = new Map<Element, (near: boolean, height: number) => void>();
  return {
    heights,
    rowHeight,
    observe(el, listener) {
      // Without IntersectionObserver (old browsers, jsdom), everything renders.
      if (typeof IntersectionObserver === 'undefined') {
        listener(true, 0);
        return () => {};
      }
      observer ??= new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            listeners.get(entry.target)?.(entry.isIntersecting, entry.boundingClientRect.height);
        },
        // `scrollMargin` extends the margin into scrolling containers, such as a chat panel, where supported.
        { rootMargin: NEAR_MARGIN, scrollMargin: NEAR_MARGIN } as IntersectionObserverInit,
      );
      listeners.set(el, listener);
      observer.observe(el);
      return () => {
        listeners.delete(el);
        observer?.unobserve(el);
      };
    },
  };
}

const VirtualizerContext = createContext<Virtualizer | null>(null);

interface ReviewActions {
  focusHunk(order: number): void;
  activate(order: number): void;
  decide(order: number, decision: HunkDecision): void;
  register(id: string, el: HTMLDivElement | null): void;
}

/**
 * Review agent file edits hunk by hunk, in unified or split view, with word-level
 * highlights. Keyboard: J/K or arrows move between hunks, A accepts, R rejects,
 * U resets, Shift+A / Shift+R decide all, ⌘/Ctrl+Enter applies.
 *
 * Large files stay responsive: a big diff is computed in a worker while the file shows
 * "Comparing…", one past `maxEditLength` becomes a single replacing hunk, and long reviews
 * render only the rows near the screen.
 */
export function DiffReview({
  files,
  title = 'Review changes',
  view: viewProp,
  defaultView = 'unified',
  onViewChange,
  decisions: decisionsProp,
  defaultDecisions,
  onDecisionsChange,
  onSubmit,
  submitLabel,
  readOnly = false,
  context = 3,
  maxEditLength = DEFAULT_MAX_EDIT_LENGTH,
  diffWorker = defaultDiffWorker,
  autoAdvance = true,
  headingLevel = 3,
  className,
  ...props
}: DiffReviewProps) {
  const Heading = `h${headingLevel}` as const;
  // Parsed by content rather than by `files` identity, so an inline array (a new one on every
  // parent render) does not re-diff every file on every decision.
  const [parsedFiles, setParsedFiles] = useState<ParsedFiles>(() => parseFiles(files, context, maxEditLength));
  let current = parsedFiles;
  if (parsedFiles.files !== files || parsedFiles.context !== context || parsedFiles.maxEditLength !== maxEditLength) {
    current = parseFiles(files, context, maxEditLength, parsedFiles);
    setParsedFiles(current);
  }
  const all = current.parsed;
  const comparing = all.some((p) => p === undefined);
  const parsed = useMemo(() => all.filter((p): p is ParsedFileDiff => p !== undefined), [all]);

  // Files too large to diff while rendering, diffed in the background; a newer change replaces an older one.
  const [failure, setFailure] = useState<{ error: unknown }>();
  const jobs = useRef(new Map<string, FileChange>());
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const { files: changes, ids, parsed: results, context: ctx, maxEditLength: limit } = parsedFiles;
    results.forEach((result, i) => {
      if (result) return;
      const change = changes[i]!;
      const id = ids[i]!;
      const running = jobs.current.get(id);
      if (running && sameChange(running, change)) return;
      jobs.current.set(id, change);
      parseInBackground(change, { context: ctx, id, maxEditLength: limit }, diffWorker).then(
        (file) => {
          if (jobs.current.get(id) !== change) return;
          jobs.current.delete(id);
          if (!mounted.current) return;
          setParsedFiles((prev) => {
            const k = prev.ids.indexOf(id);
            const stale =
              k === -1 ||
              prev.parsed[k] !== undefined ||
              !sameChange(prev.files[k]!, change) ||
              prev.context !== ctx ||
              prev.maxEditLength !== limit;
            if (stale) return prev;
            const next = [...prev.parsed];
            next[k] = file;
            return { ...prev, parsed: next };
          });
        },
        (error: unknown) => {
          if (jobs.current.get(id) === change) jobs.current.delete(id);
          // Thrown while rendering, as a file that fails to parse synchronously is.
          if (mounted.current) setFailure({ error });
        },
      );
    });
  }, [parsedFiles, diffWorker]);

  const flat = useMemo<FlatHunk[]>(() => {
    const list: FlatHunk[] = [];
    for (const file of parsed) for (const hunk of file.hunks) list.push({ file, hunk, order: list.length });
    return list;
  }, [parsed]);

  const [viewState, setViewState] = useState<DiffViewMode>(defaultView);
  const view = viewProp ?? viewState;
  const setView = (v: DiffViewMode) => {
    if (viewProp === undefined) setViewState(v);
    onViewChange?.(v);
  };

  const [decisionState, setDecisionState] = useState<Record<string, HunkDecision>>(() => ({ ...defaultDecisions }));
  const decisions = decisionsProp ?? decisionState;
  const setDecisions = (next: Record<string, HunkDecision>) => {
    if (decisionsProp === undefined) setDecisionState(next);
    onDecisionsChange?.(next);
  };

  const [activeState, setActive] = useState(0);
  // Clamped, so a hunk stays in the tab order when `files` shrinks below the active one.
  const active = Math.min(activeState, Math.max(0, flat.length - 1));
  const [announcement, setAnnouncement] = useState('');
  const hunkEls = useRef(new Map<string, HTMLDivElement>());
  const mac = useIsMac();

  const counts = useMemo(() => {
    let accepted = 0;
    let rejected = 0;
    for (const { hunk } of flat) {
      const d = decisions[hunk.id];
      if (d === 'accepted') accepted++;
      else if (d === 'rejected') rejected++;
    }
    return { accepted, rejected, pending: flat.length - accepted - rejected, total: flat.length };
  }, [flat, decisions]);

  // Rows per hunk in the current view, and where each hunk's rows start in the review.
  const layout = useMemo(() => {
    const offsets = new Map<string, number>();
    let rows = 0;
    for (const { hunk } of flat) {
      offsets.set(hunk.id, rows);
      rows += view === 'split' ? splitRowCount(hunk.lines) : hunk.lines.length;
    }
    return { offsets, rows };
  }, [flat, view]);
  const virtualize = layout.rows > VIRTUALIZE_ROWS;
  const rootRef = useRef<HTMLElement>(null);
  const [rowHeight, setRowHeight] = useState(ROW_HEIGHT);
  // One observer per review and row height; chunks keep their measured heights across views.
  const [heights] = useState<Virtualizer['heights']>(() => new WeakMap());
  const virtualizer = useMemo(() => createVirtualizer(rowHeight, heights), [rowHeight, heights]);
  useIsoLayoutEffect(() => {
    if (!virtualize) return;
    const row = rootRef.current?.querySelector('[data-slot="signoff-diff-hunk"] [data-line]');
    const measured = row?.getBoundingClientRect().height ?? 0;
    if (measured > 0 && Math.abs(measured - rowHeight) > 0.5) setRowHeight(measured);
  }, [virtualize, view, rowHeight]);

  // Handlers for the memoized hunks: stable functions that always see the latest render.
  const latest = useRef<Omit<ReviewActions, 'register'> | null>(null);
  const decide = (item: FlatHunk, decision: HunkDecision, advance: boolean) => {
    const next = { ...decisions, [item.hunk.id]: decision };
    setDecisions(next);
    const remaining = flat.filter((f) => (next[f.hunk.id] ?? 'pending') === 'pending').length;
    const verb = decision === 'pending' ? 'reset' : decision;
    setAnnouncement(
      `Hunk ${item.order + 1} of ${flat.length} ${verb}. ${remaining === 0 ? 'All hunks reviewed.' : `${remaining} remaining.`}`,
    );
    if (advance && decision !== 'pending') {
      const after = flat.slice(item.order + 1).find((f) => (next[f.hunk.id] ?? 'pending') === 'pending');
      const wrap = after ?? flat.find((f) => (next[f.hunk.id] ?? 'pending') === 'pending');
      if (wrap) focusHunk(wrap.order);
    }
  };
  const focusHunk = (index: number) => {
    const target = flat[Math.max(0, Math.min(flat.length - 1, index))];
    if (!target) return;
    setActive(target.order);
    hunkEls.current.get(target.hunk.id)?.focus();
  };
  useIsoLayoutEffect(() => {
    latest.current = {
      focusHunk,
      activate: setActive,
      decide: (order, decision) => {
        const item = flat[order];
        if (item) decide(item, decision, false);
      },
    };
  });
  const [actions] = useState<ReviewActions>(() => ({
    focusHunk: (order) => latest.current?.focusHunk(order),
    activate: (order) => latest.current?.activate(order),
    decide: (order, decision) => latest.current?.decide(order, decision),
    register: (id, el) => {
      if (el) hunkEls.current.set(id, el);
      else hunkEls.current.delete(id);
    },
  }));

  const decideAll = (decision: Exclude<HunkDecision, 'pending'>) => {
    const next: Record<string, HunkDecision> = {};
    for (const { hunk } of flat) next[hunk.id] = decision;
    setDecisions(next);
    setAnnouncement(`All ${flat.length} hunks ${decision}.`);
  };

  // One submission per set of decisions, so a double click or a repeated Ctrl+Enter sends it once.
  // Re-armed when the files change by content or a decision changes by value: an equal `files` array
  // or controlled `decisions` object passed on every render must not re-arm it.
  const submitted = useRef(false);
  const reviewed = useRef({ parsed, decisions });
  useEffect(() => {
    const previous = reviewed.current;
    if (previous.parsed !== parsed || !sameDecisions(previous.decisions, decisions)) submitted.current = false;
    reviewed.current = { parsed, decisions };
  }, [parsed, decisions]);
  const submit = () => {
    // Every file has to be compared before the review means anything.
    if (!onSubmit || submitted.current || comparing) return;
    submitted.current = true;
    let result: void | PromiseLike<void>;
    try {
      result = onSubmit(computeReviewResult(parsed, decisions));
    } catch (error) {
      // A failed handler sent nothing: let the user try again.
      submitted.current = false;
      throw error;
    }
    if (isPromiseLike(result)) {
      void Promise.resolve(result).finally(() => {
        submitted.current = false;
      });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (readOnly || isTypingTarget(event.target)) return;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
      return;
    }
    if (hasModifier(event)) return;
    const insideHunk = (event.target as HTMLElement).closest('[data-slot="signoff-diff-hunk"]');
    const item = flat[active];
    const key = event.key;
    if (key === 'j' || key === 'ArrowDown' || key === 'k' || key === 'ArrowUp') {
      // Arrow keys only navigate when a hunk (not e.g. the view toggle) has focus.
      if (key.startsWith('Arrow') && !insideHunk) return;
      event.preventDefault();
      focusHunk(insideHunk ? active + (key === 'j' || key === 'ArrowDown' ? 1 : -1) : active);
      return;
    }
    if (event.shiftKey && (key === 'A' || key === 'R')) {
      event.preventDefault();
      if (!comparing) decideAll(key === 'A' ? 'accepted' : 'rejected');
      return;
    }
    if (!item || !insideHunk || event.shiftKey) return;
    if (key === 'a') {
      event.preventDefault();
      decide(item, 'accepted', autoAdvance);
    } else if (key === 'r' || key === 'x') {
      event.preventDefault();
      decide(item, 'rejected', autoAdvance);
    } else if (key === 'u') {
      event.preventDefault();
      decide(item, 'pending', false);
    }
  };

  const additions = parsed.reduce((n, f) => n + f.additions, 0);
  const deletions = parsed.reduce((n, f) => n + f.deletions, 0);
  const label = submitLabel ?? (counts.accepted > 0 ? `Apply ${counts.accepted} of ${counts.total}` : 'Apply changes');
  const mod = mac ? '⌘' : 'Ctrl';
  const orders = useMemo(() => new Map(flat.map((f) => [f.hunk.id, f.order])), [flat]);
  // A file that failed to diff in the background fails the render, as one diffed while rendering does.
  if (failure) throw failure.error;

  return (
    // Review shortcuts are scoped to focus within the diff (WCAG 2.1.4); every action is also a button.
    <section
      ref={rootRef}
      data-signoff
      data-slot="signoff-diff-review"
      aria-label={typeof title === 'string' ? title : 'Review changes'}
      onKeyDown={onKeyDown}
      className={cn(
        'rounded-signoff border-signoff-border bg-signoff-surface font-signoff-sans text-signoff-fg overflow-hidden border',
        className,
      )}
      {...props}
    >
      <div className="border-signoff-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <Heading className="text-signoff-fg text-sm font-semibold">{title}</Heading>
          <p className="font-signoff-mono text-signoff-fg-subtle mt-0.5 text-xs">
            {all.length} {all.length === 1 ? 'file' : 'files'} · {flat.length} {flat.length === 1 ? 'hunk' : 'hunks'}
            {comparing && ' so far'} · <span className="text-signoff-accent-fg">+{additions}</span>{' '}
            <span className="text-signoff-hot-fg">−{deletions}</span>
          </p>
        </div>
        <ToggleGroup.Root
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as DiffViewMode)}
          aria-label="Diff layout"
          className="border-signoff-border bg-signoff-bg/50 inline-flex rounded-lg border p-0.5"
        >
          {(['unified', 'split'] as const).map((mode) => (
            <ToggleGroup.Item
              key={mode}
              value={mode}
              className="text-signoff-fg-muted hover:text-signoff-fg focus-visible:outline-signoff-ring data-[state=on]:bg-signoff-surface-2 data-[state=on]:text-signoff-fg cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 data-[state=on]:shadow-[inset_0_0_0_1px_var(--signoff-border-strong)]"
            >
              {mode}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <VirtualizerContext.Provider value={virtualize ? virtualizer : null}>
        {all.map((file, i) => {
          const change = current.files[i]!;
          const id = current.ids[i]!;
          return (
            <FileSection key={id} path={change.path} file={file}>
              {file?.hunks.map((hunk) => {
                const order = orders.get(hunk.id)!;
                return (
                  <Hunk
                    key={hunk.id}
                    hunk={hunk}
                    file={file}
                    order={order}
                    total={flat.length}
                    view={view}
                    decision={decisions[hunk.id] ?? 'pending'}
                    active={order === active}
                    readOnly={readOnly}
                    rowOffset={layout.offsets.get(hunk.id) ?? 0}
                    actions={actions}
                  />
                );
              })}
            </FileSection>
          );
        })}
      </VirtualizerContext.Provider>

      {!readOnly && (
        <div className="border-signoff-border bg-signoff-surface-2/30 flex flex-wrap items-center gap-x-4 gap-y-3 border-t px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-signoff-fg-muted text-xs">
              <span className="text-signoff-fg font-semibold tabular-nums">
                {counts.accepted + counts.rejected}/{counts.total}
              </span>{' '}
              reviewed
              {comparing ? (
                <span className="text-signoff-fg-subtle"> · comparing files…</span>
              ) : (
                counts.pending > 0 &&
                counts.accepted + counts.rejected > 0 && (
                  <span className="text-signoff-fg-subtle"> · unreviewed hunks are skipped</span>
                )
              )}
            </p>
            <div aria-hidden="true" className="flex h-1 w-40 gap-0.5 overflow-hidden rounded-full">
              {flat.map(({ hunk }) => {
                const d = decisions[hunk.id] ?? 'pending';
                return (
                  <span
                    key={hunk.id}
                    className={cn(
                      'h-full flex-1 transition-colors',
                      d === 'accepted'
                        ? 'bg-signoff-accent'
                        : d === 'rejected'
                          ? 'bg-signoff-hot'
                          : 'bg-signoff-border-strong',
                    )}
                  />
                );
              })}
            </div>
          </div>
          <p className="text-signoff-fg-subtle hidden items-center gap-1 text-[11px] lg:flex" aria-hidden="true">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd>
            <span className="mr-1.5">move</span>
            <Kbd>A</Kbd>
            <span className="mr-1.5">accept</span>
            <Kbd>R</Kbd>
            <span className="mr-1.5">reject</span>
            <Kbd>{mod}</Kbd>
            <Kbd>↵</Kbd>
            <span>apply</span>
          </p>
          <p className="sr-only">
            Keyboard: J or K to move between hunks, A to accept, R to reject, U to reset, Shift A or Shift R for all
            hunks, {mod} Enter to apply.
          </p>
          <div className="ml-auto flex items-center gap-2">
            {/* aria-disabled rather than disabled while comparing: the buttons keep focus. */}
            <button
              type="button"
              aria-disabled={comparing || undefined}
              onClick={() => !comparing && decideAll('rejected')}
              className={secondaryButton}
            >
              Reject all
            </button>
            <button
              type="button"
              aria-disabled={comparing || undefined}
              onClick={() => !comparing && decideAll('accepted')}
              className={secondaryButton}
            >
              Accept all
            </button>
            {onSubmit && (
              <button
                type="button"
                data-slot="signoff-diff-submit"
                aria-disabled={comparing || undefined}
                onClick={submit}
                aria-keyshortcuts={mac ? 'Meta+Enter' : 'Control+Enter'}
                className="bg-signoff-accent text-signoff-on-accent hover:bg-signoff-accent/90 focus-visible:outline-signoff-ring inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              >
                {label}
              </button>
            )}
          </div>
        </div>
      )}
      <LiveRegion>{announcement}</LiveRegion>
    </section>
  );
}

const secondaryButton =
  'inline-flex h-8 cursor-pointer items-center rounded-lg border border-signoff-border-strong px-3 text-[13px] font-medium text-signoff-fg-muted transition-colors hover:bg-signoff-surface-2 hover:text-signoff-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signoff-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-60';

/** A file's header and hunks, or "Comparing…" while it is diffed in the background. */
function FileSection({
  path,
  file,
  children,
}: {
  path: string;
  file: ParsedFileDiff | undefined;
  children: ReactNode;
}) {
  const badge = file ? STATUS_BADGE[file.status] : undefined;
  const slash = path.lastIndexOf('/');
  return (
    <div
      data-slot="signoff-diff-file"
      data-fallback={file?.fallback}
      aria-busy={file ? undefined : true}
      className="border-signoff-border border-b last:border-b-0"
    >
      <div className="border-signoff-border bg-signoff-surface-2/60 font-signoff-mono flex items-center gap-2.5 border-b px-4 py-2 text-xs">
        {badge && (
          <span
            className={cn(
              'inline-flex size-[18px] items-center justify-center rounded border text-[10px] font-bold',
              badge.className,
            )}
            title={badge.label}
          >
            <span aria-hidden="true">{badge.letter}</span>
            <span className="sr-only">{badge.label}:</span>
          </span>
        )}
        <span className="min-w-0 truncate">
          {slash > 0 && <span className="text-signoff-fg-subtle">{path.slice(0, slash + 1)}</span>}
          <span className="text-signoff-fg font-medium">{path.slice(slash + 1)}</span>
        </span>
        {file && (
          <span className="ml-auto shrink-0 tabular-nums">
            <span className="text-signoff-accent-fg">+{file.additions}</span>{' '}
            <span className="text-signoff-hot-fg">−{file.deletions}</span>
          </span>
        )}
      </div>
      {!file && <p className="text-signoff-fg-subtle px-4 py-3 text-xs">Comparing changes…</p>}
      {file?.fallback === 'replace' && (
        <p data-slot="signoff-diff-fallback" className="text-signoff-fg-muted px-4 pt-3 pb-1 text-xs">
          Too many changes to compare line by line: the changed lines are shown as one hunk that replaces them.
        </p>
      )}
      {file?.hunks.length === 0 && <p className="text-signoff-fg-subtle px-4 py-3 text-xs">No textual changes.</p>}
      {children}
    </div>
  );
}

interface HunkProps {
  hunk: DiffHunk;
  file: ParsedFileDiff;
  order: number;
  total: number;
  view: DiffViewMode;
  decision: HunkDecision;
  active: boolean;
  readOnly: boolean;
  /** Rows of the review before this hunk's, for which chunks render at first. */
  rowOffset: number;
  actions: ReviewActions;
}

/** Memoized: a decision re-renders the hunk it changed and the ones gaining or losing focus. */
const Hunk = memo(function Hunk({
  hunk,
  file,
  order,
  total,
  view,
  decision,
  active,
  readOnly,
  rowOffset,
  actions,
}: HunkProps) {
  const codeRef = useScrollRegion<HTMLDivElement>(`Hunk ${order + 1} code, ${file.path}`);
  const virtualizer = useContext(VirtualizerContext);
  const lastLine = hunk.newLines > 0 ? hunk.newStart + hunk.newLines - 1 : hunk.newStart;
  const name = `Hunk ${order + 1} of ${total}, ${file.path}, lines ${hunk.newStart} to ${lastLine}, ${decision === 'pending' ? 'not reviewed' : decision}`;
  const rejected = decision === 'rejected';
  return (
    // A roving-tabindex item: focus tracking only, all actions are buttons.
    <div
      ref={(el) => actions.register(hunk.id, el)}
      role="group"
      aria-label={name}
      tabIndex={active ? 0 : -1}
      data-slot="signoff-diff-hunk"
      data-decision={decision}
      onFocus={() => actions.activate(order)}
      className={cn(
        'border-signoff-border/70 focus-visible:outline-signoff-ring relative border-b last:border-b-0 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2',
        "before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-[3px] before:content-['']",
        decision === 'accepted' && 'before:bg-signoff-accent',
        rejected && 'before:bg-signoff-hot',
      )}
    >
      <div className="bg-signoff-bg/35 flex min-h-9 items-center gap-2 py-1 pr-2 pl-4">
        <span className="font-signoff-mono text-signoff-fg-subtle min-w-0 truncate text-[11px]">{hunk.header}</span>
        {decision !== 'pending' && (
          <span
            className={cn(
              'font-signoff-mono rounded-full px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase',
              decision === 'accepted'
                ? 'bg-signoff-accent/15 text-signoff-accent-fg'
                : 'bg-signoff-hot/15 text-signoff-hot-fg',
            )}
          >
            {decision}
          </span>
        )}
        {!readOnly && (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {decision !== 'pending' && (
              <button
                type="button"
                onClick={() => actions.decide(order, 'pending')}
                aria-label={`Reset hunk ${order + 1}`}
                className="text-signoff-fg-subtle hover:bg-signoff-surface-2 hover:text-signoff-fg focus-visible:outline-signoff-ring inline-flex size-7 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1"
              >
                <UndoIcon size={13} />
              </button>
            )}
            <button
              type="button"
              aria-pressed={rejected}
              aria-label={`Reject hunk ${order + 1}`}
              onClick={() => actions.decide(order, rejected ? 'pending' : 'rejected')}
              className={cn(
                hunkButton,
                rejected
                  ? 'border-signoff-hot/60 bg-signoff-hot/15 text-signoff-hot-fg'
                  : 'border-signoff-border text-signoff-fg-muted hover:border-signoff-hot/50 hover:text-signoff-hot-fg',
              )}
            >
              <XIcon size={12} strokeWidth={2.5} />
              Reject
            </button>
            <button
              type="button"
              aria-pressed={decision === 'accepted'}
              aria-label={`Accept hunk ${order + 1}`}
              onClick={() => actions.decide(order, decision === 'accepted' ? 'pending' : 'accepted')}
              className={cn(
                hunkButton,
                decision === 'accepted'
                  ? 'border-signoff-accent/60 bg-signoff-accent/15 text-signoff-accent-fg'
                  : 'border-signoff-border text-signoff-fg-muted hover:border-signoff-accent/50 hover:text-signoff-accent-fg',
              )}
            >
              <CheckIcon size={12} strokeWidth={2.5} />
              Accept
            </button>
          </span>
        )}
      </div>
      {/* Long lines scroll sideways; while they do, the code is a named group the keyboard can reach. */}
      <div
        ref={codeRef}
        className={cn(
          'focus-visible:outline-signoff-ring overflow-x-auto transition-opacity focus-visible:outline-2 focus-visible:-outline-offset-2',
          rejected && 'opacity-55',
        )}
      >
        {view === 'unified' ? (
          <UnifiedRows
            hunk={hunk}
            language={file.language}
            rejected={rejected}
            virtualizer={virtualizer}
            rowOffset={rowOffset}
          />
        ) : (
          <SplitRows
            hunk={hunk}
            language={file.language}
            rejected={rejected}
            virtualizer={virtualizer}
            rowOffset={rowOffset}
          />
        )}
      </div>
    </div>
  );
});

const hunkButton =
  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signoff-ring';

const ROW_BG: Record<DiffLine['type'], string> = {
  context: '',
  add: 'bg-signoff-add',
  del: 'bg-signoff-del',
};
const SIGN: Record<DiffLine['type'], { glyph: string; sr: string; className: string }> = {
  context: { glyph: ' ', sr: '', className: '' },
  add: { glyph: '+', sr: 'Added: ', className: 'text-signoff-accent-fg' },
  del: { glyph: '−', sr: 'Removed: ', className: 'text-signoff-hot-fg' },
};

/** A line as a screen reader hears it, for chunks that are not on screen. */
const spoken = (line: DiffLine) => `${SIGN[line.type].sr}${line.content}`;

/**
 * Rows of a virtualized hunk, `CHUNK_ROWS` at a time. Near the viewport a chunk renders its rows;
 * away from it, only its height (measured once it has rendered) and its lines as hidden text.
 * A chunk that holds focus stays rendered.
 */
function Chunk({
  hunk,
  id,
  rows,
  initiallyNear,
  virtualizer,
  text,
  className,
  children,
}: {
  hunk: DiffHunk;
  /** The chunk within its hunk, by view and first row. */
  id: string;
  rows: number;
  initiallyNear: boolean;
  virtualizer: Virtualizer;
  text: () => string;
  className?: string;
  children: () => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(initiallyNear);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return virtualizer.observe(el, (isNear, height) => {
      if (!isNear && el.contains(document.activeElement)) return;
      if (!isNear && height > 0 && el.hasAttribute('data-rendered')) {
        let measured = virtualizer.heights.get(hunk);
        if (!measured) virtualizer.heights.set(hunk, (measured = new Map()));
        measured.set(id, height);
      }
      setNear(isNear);
    });
  }, [virtualizer, hunk, id]);
  if (near) {
    return (
      <div ref={ref} data-slot="signoff-diff-chunk" data-rendered="" className={className}>
        {children()}
      </div>
    );
  }
  const height = virtualizer.heights.get(hunk)?.get(id) ?? rows * virtualizer.rowHeight;
  return (
    <div ref={ref} data-slot="signoff-diff-chunk" className="relative" style={{ height }}>
      <div className="sr-only whitespace-pre">{text()}</div>
    </div>
  );
}

/** Chunk boundaries for `count` rows: [start, end) pairs. */
function chunks(count: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let start = 0; start < count; start += CHUNK_ROWS) out.push([start, Math.min(count, start + CHUNK_ROWS)]);
  return out;
}

function LineContent({
  line,
  language,
  rejected,
  wrap = false,
}: {
  line: DiffLine;
  language: string;
  rejected: boolean;
  wrap?: boolean;
}) {
  const pieces = useMemo(
    () => mergeTokensWithSegments(tokenizeLine(line.content, language), line.segments),
    [line, language],
  );
  return (
    <span
      className={cn(
        wrap ? 'min-w-0 flex-1 pr-3 break-all whitespace-pre-wrap' : 'pr-6 whitespace-pre',
        rejected && line.type === 'add' && 'decoration-signoff-hot/50 line-through',
      )}
    >
      <span className="sr-only">{SIGN[line.type].sr}</span>
      {pieces.map((p, i) => (
        <span
          key={i}
          className={cn(
            TOKEN_CLASS[p.kind],
            p.changed && 'rounded-[3px]',
            p.changed && (line.type === 'add' ? 'bg-signoff-add-strong' : 'bg-signoff-del-strong'),
          )}
        >
          {p.text}
        </span>
      ))}
      {line.content === '' && ' '}
    </span>
  );
}

function UnifiedRow({ line, language, rejected }: { line: DiffLine; language: string; rejected: boolean }) {
  const sign = SIGN[line.type];
  return (
    <div data-line={line.type} className={cn('flex', ROW_BG[line.type])}>
      <span aria-hidden="true" className="text-signoff-fg-subtle w-11 shrink-0 pr-2 text-right select-none">
        {line.oldNumber ?? ''}
      </span>
      <span aria-hidden="true" className="text-signoff-fg-subtle w-11 shrink-0 pr-2 text-right select-none">
        {line.newNumber ?? ''}
      </span>
      <span aria-hidden="true" className={cn('w-5 shrink-0 text-center select-none', sign.className)}>
        {sign.glyph}
      </span>
      <LineContent line={line} language={language} rejected={rejected} />
    </div>
  );
}

interface RowsProps {
  hunk: DiffHunk;
  language: string;
  rejected: boolean;
  /** Set when the review is long enough to render only what is near the screen. */
  virtualizer: Virtualizer | null;
  rowOffset: number;
}

function UnifiedRows({ hunk, language, rejected, virtualizer, rowOffset }: RowsProps) {
  const lines = hunk.lines;
  // Unrendered rows have no width: keep the widest line's, so the sideways scroll does not change.
  const widest = useMemo(() => lines.reduce((n, l) => Math.max(n, l.content.length), 0), [lines]);
  const row = (line: DiffLine, i: number) => <UnifiedRow key={i} line={line} language={language} rejected={rejected} />;
  return (
    <div className="font-signoff-mono min-w-max py-1 text-[12.5px] leading-[1.6]">
      {virtualizer ? (
        <div style={{ minWidth: `calc(${widest}ch + 8.25rem)` }}>
          {chunks(lines.length).map(([start, end]) => (
            <Chunk
              key={start}
              hunk={hunk}
              id={`u${start}`}
              rows={end - start}
              initiallyNear={rowOffset + start < INITIAL_ROWS}
              virtualizer={virtualizer}
              text={() => lines.slice(start, end).map(spoken).join('\n')}
            >
              {() => lines.slice(start, end).map((line, i) => row(line, start + i))}
            </Chunk>
          ))}
        </div>
      ) : (
        lines.map(row)
      )}
    </div>
  );
}

type SplitRow = { left?: DiffLine | undefined; right?: DiffLine | undefined };

function toSplitRows(lines: readonly DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.type === 'context') {
      rows.push({ left: line, right: line });
      i++;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (lines[i]?.type === 'del') dels.push(lines[i++]!);
    while (lines[i]?.type === 'add') adds.push(lines[i++]!);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) rows.push({ left: dels[k], right: adds[k] });
  }
  return rows;
}

/** How many rows `toSplitRows` makes, without making them. */
function splitRowCount(lines: readonly DiffLine[]): number {
  let rows = 0;
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.type === 'context') {
      rows++;
      i++;
      continue;
    }
    const start = i;
    while (lines[i]?.type === 'del') i++;
    const dels = i - start;
    while (lines[i]?.type === 'add') i++;
    rows += Math.max(dels, i - start - dels);
  }
  return rows;
}

function SplitCell({
  line,
  side,
  language,
  rejected,
  hidden = false,
}: {
  line: DiffLine | undefined;
  side: 'left' | 'right';
  language: string;
  rejected: boolean;
  /** Context lines appear on both sides; hide the duplicate from assistive tech. */
  hidden?: boolean;
}) {
  if (!line) return <div aria-hidden="true" className="bg-signoff-bg/30" />;
  const number = side === 'left' ? line.oldNumber : line.newNumber;
  const sign = SIGN[line.type];
  return (
    <div data-line={line.type} aria-hidden={hidden || undefined} className={cn('flex min-w-0', ROW_BG[line.type])}>
      <span aria-hidden="true" className="text-signoff-fg-subtle w-10 shrink-0 pr-2 text-right select-none">
        {number ?? ''}
      </span>
      <span aria-hidden="true" className={cn('w-4 shrink-0 text-center select-none', sign.className)}>
        {sign.glyph}
      </span>
      <LineContent line={line} language={language} rejected={rejected} wrap />
    </div>
  );
}

const SPLIT_GRID = 'grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)]';

/** Split view: one shared grid so the two columns stay aligned; long lines wrap. */
function SplitRows({ hunk, language, rejected, virtualizer, rowOffset }: RowsProps) {
  const rows = useMemo(() => toSplitRows(hunk.lines), [hunk.lines]);
  const cells = (row: SplitRow, i: number) => (
    <Fragment key={i}>
      <SplitCell line={row.left} side="left" language={language} rejected={rejected} />
      <span aria-hidden="true" className="bg-signoff-border" />
      <SplitCell
        line={row.right}
        side="right"
        language={language}
        rejected={rejected}
        hidden={row.left !== undefined && row.left === row.right}
      />
    </Fragment>
  );
  if (!virtualizer) {
    return (
      <div className={cn('font-signoff-mono py-1 text-[12.5px] leading-[1.6]', SPLIT_GRID)}>{rows.map(cells)}</div>
    );
  }
  // Read in the same order as the cells: the left line, then the right one unless it is the same.
  const text = (start: number, end: number) =>
    rows
      .slice(start, end)
      .flatMap((row) => [row.left, row.right === row.left ? undefined : row.right])
      .filter((line): line is DiffLine => line !== undefined)
      .map(spoken)
      .join('\n');
  return (
    <div className="font-signoff-mono py-1 text-[12.5px] leading-[1.6]">
      {chunks(rows.length).map(([start, end]) => (
        <Chunk
          key={start}
          hunk={hunk}
          id={`s${start}`}
          rows={end - start}
          initiallyNear={rowOffset + start < INITIAL_ROWS}
          virtualizer={virtualizer}
          text={() => text(start, end)}
          className={SPLIT_GRID}
        >
          {() => rows.slice(start, end).map((row, i) => cells(row, start + i))}
        </Chunk>
      ))}
    </div>
  );
}
