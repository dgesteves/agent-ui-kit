'use client';

import { ToggleGroup } from 'radix-ui';
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  computeReviewResult,
  parseFileChange,
  type DiffHunk,
  type DiffLine,
  type DiffReviewResult,
  type FileChange,
  type HunkDecision,
  type ParsedFileDiff,
} from './lib/diff';
import { mergeTokensWithSegments, TOKEN_CLASS, tokenizeLine } from './lib/highlight';
import { useIsMac } from './lib/hooks';
import { CheckIcon, UndoIcon, XIcon } from './lib/icons';
import { Kbd, LiveRegion } from './lib/primitives';
import { cn, hasModifier, isPromiseLike, isTypingTarget, type HeadingLevel } from './lib/utils';

export type { DiffReviewFileResult, DiffReviewResult, FileChange, HunkDecision } from './lib/diff';
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
  parsed: ParsedFileDiff[];
}

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
function parseFiles(files: readonly FileChange[], context: number, previous?: ParsedFiles): ParsedFileDiff[] {
  // Two changes must not share hunk ids, or deciding one hunk decides the other too.
  const ids = fileIds(files);
  const parsed = files.map((f, i) => {
    const id = ids[i]!;
    const before = previous?.files[i];
    const reused = previous?.context === context && before && sameChange(before, f) ? previous.parsed[i] : undefined;
    return reused?.id === id ? reused : parseFileChange(f, { context, id });
  });
  // Keep the previous array when nothing changed, so memoized work downstream is kept too.
  const same = previous && parsed.length === previous.parsed.length && parsed.every((p, i) => p === previous.parsed[i]);
  return same ? previous.parsed : parsed;
}

const STATUS_BADGE: Record<ParsedFileDiff['status'], { letter: string; label: string; className: string }> = {
  modified: { letter: 'M', label: 'Modified', className: 'border-aui-warn/40 text-aui-warn-fg' },
  added: { letter: 'A', label: 'Added', className: 'border-aui-accent/45 text-aui-accent-fg' },
  deleted: { letter: 'D', label: 'Deleted', className: 'border-aui-hot/45 text-aui-hot-fg' },
  renamed: { letter: 'R', label: 'Renamed', className: 'border-aui-border-strong text-aui-fg-muted' },
};

/**
 * Review agent file edits hunk by hunk, in unified or split view, with word-level
 * highlights. Keyboard: J/K or arrows move between hunks, A accepts, R rejects,
 * U resets, Shift+A / Shift+R decide all, ⌘/Ctrl+Enter applies.
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
  autoAdvance = true,
  headingLevel = 3,
  className,
  ...props
}: DiffReviewProps) {
  const Heading = `h${headingLevel}` as const;
  // Parsed by content rather than by `files` identity, so an inline array (a new one on every
  // parent render) does not re-diff every file on every decision.
  const [parsedFiles, setParsedFiles] = useState<ParsedFiles>(() => ({
    files,
    context,
    parsed: parseFiles(files, context),
  }));
  let parsed = parsedFiles.parsed;
  if (parsedFiles.files !== files || parsedFiles.context !== context) {
    parsed = parseFiles(files, context, parsedFiles);
    setParsedFiles({ files, context, parsed });
  }
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
  // Handlers run per discrete event, and React re-renders between discrete events,
  // so reading `decisions` from the render closure is always current.
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

  const focusHunk = (index: number) => {
    const target = flat[Math.max(0, Math.min(flat.length - 1, index))];
    if (!target) return;
    setActive(target.order);
    hunkEls.current.get(target.hunk.id)?.focus();
  };

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
    if (!onSubmit || submitted.current) return;
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
    const insideHunk = (event.target as HTMLElement).closest('[data-slot="diff-hunk"]');
    const current = flat[active];
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
      decideAll(key === 'A' ? 'accepted' : 'rejected');
      return;
    }
    if (!current || !insideHunk || event.shiftKey) return;
    if (key === 'a') {
      event.preventDefault();
      decide(current, 'accepted', autoAdvance);
    } else if (key === 'r' || key === 'x') {
      event.preventDefault();
      decide(current, 'rejected', autoAdvance);
    } else if (key === 'u') {
      event.preventDefault();
      decide(current, 'pending', false);
    }
  };

  const additions = parsed.reduce((n, f) => n + f.additions, 0);
  const deletions = parsed.reduce((n, f) => n + f.deletions, 0);
  const label = submitLabel ?? (counts.accepted > 0 ? `Apply ${counts.accepted} of ${counts.total}` : 'Apply changes');
  const mod = mac ? '⌘' : 'Ctrl';

  return (
    // Review shortcuts are scoped to focus within the diff (WCAG 2.1.4); every action is also a button.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      data-aui
      data-slot="diff-review"
      aria-label={typeof title === 'string' ? title : 'Review changes'}
      onKeyDown={onKeyDown}
      className={cn(
        'rounded-aui border-aui-border bg-aui-surface font-aui-sans text-aui-fg overflow-hidden border',
        className,
      )}
      {...props}
    >
      <div className="border-aui-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <Heading className="text-aui-fg text-sm font-semibold">{title}</Heading>
          <p className="font-aui-mono text-aui-fg-subtle mt-0.5 text-xs">
            {parsed.length} {parsed.length === 1 ? 'file' : 'files'} · {flat.length}{' '}
            {flat.length === 1 ? 'hunk' : 'hunks'} · <span className="text-aui-accent-fg">+{additions}</span>{' '}
            <span className="text-aui-hot-fg">−{deletions}</span>
          </p>
        </div>
        <ToggleGroup.Root
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as DiffViewMode)}
          aria-label="Diff layout"
          className="border-aui-border bg-aui-bg/50 inline-flex rounded-lg border p-0.5"
        >
          {(['unified', 'split'] as const).map((mode) => (
            <ToggleGroup.Item
              key={mode}
              value={mode}
              className="text-aui-fg-muted hover:text-aui-fg focus-visible:outline-aui-ring data-[state=on]:bg-aui-surface-2 data-[state=on]:text-aui-fg cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 data-[state=on]:shadow-[inset_0_0_0_1px_var(--aui-border-strong)]"
            >
              {mode}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      {parsed.map((file) => {
        const badge = STATUS_BADGE[file.status];
        const slash = file.path.lastIndexOf('/');
        return (
          <div key={file.id} data-slot="diff-file" className="border-aui-border border-b last:border-b-0">
            <div className="border-aui-border bg-aui-surface-2/60 font-aui-mono flex items-center gap-2.5 border-b px-4 py-2 text-xs">
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
              <span className="min-w-0 truncate">
                {slash > 0 && <span className="text-aui-fg-subtle">{file.path.slice(0, slash + 1)}</span>}
                <span className="text-aui-fg font-medium">{file.path.slice(slash + 1)}</span>
              </span>
              <span className="ml-auto shrink-0 tabular-nums">
                <span className="text-aui-accent-fg">+{file.additions}</span>{' '}
                <span className="text-aui-hot-fg">−{file.deletions}</span>
              </span>
            </div>
            {file.hunks.length === 0 && <p className="text-aui-fg-subtle px-4 py-3 text-xs">No textual changes.</p>}
            {file.hunks.map((hunk) => {
              const item = flat.find((f) => f.hunk.id === hunk.id)!;
              return (
                <Hunk
                  key={hunk.id}
                  hunk={hunk}
                  file={file}
                  order={item.order}
                  total={flat.length}
                  view={view}
                  decision={decisions[hunk.id] ?? 'pending'}
                  active={item.order === active}
                  readOnly={readOnly}
                  registerRef={(el) => {
                    if (el) hunkEls.current.set(hunk.id, el);
                    else hunkEls.current.delete(hunk.id);
                  }}
                  onFocus={() => setActive(item.order)}
                  onDecide={(d) => decide(item, d, false)}
                />
              );
            })}
          </div>
        );
      })}

      {!readOnly && (
        <div className="border-aui-border bg-aui-surface-2/30 flex flex-wrap items-center gap-x-4 gap-y-3 border-t px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="text-aui-fg-muted text-xs">
              <span className="text-aui-fg font-semibold tabular-nums">
                {counts.accepted + counts.rejected}/{counts.total}
              </span>{' '}
              reviewed
              {counts.pending > 0 && counts.accepted + counts.rejected > 0 && (
                <span className="text-aui-fg-subtle"> · unreviewed hunks are skipped</span>
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
                      d === 'accepted' ? 'bg-aui-accent' : d === 'rejected' ? 'bg-aui-hot' : 'bg-aui-border-strong',
                    )}
                  />
                );
              })}
            </div>
          </div>
          <p className="text-aui-fg-subtle hidden items-center gap-1 text-[11px] lg:flex" aria-hidden="true">
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
            <button type="button" onClick={() => decideAll('rejected')} className={secondaryButton}>
              Reject all
            </button>
            <button type="button" onClick={() => decideAll('accepted')} className={secondaryButton}>
              Accept all
            </button>
            {onSubmit && (
              <button
                type="button"
                data-slot="diff-submit"
                onClick={submit}
                aria-keyshortcuts={mac ? 'Meta+Enter' : 'Control+Enter'}
                className="bg-aui-accent text-aui-on-accent hover:bg-aui-accent/90 focus-visible:outline-aui-ring inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
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
  'inline-flex h-8 cursor-pointer items-center rounded-lg border border-aui-border-strong px-3 text-[13px] font-medium text-aui-fg-muted transition-colors hover:bg-aui-surface-2 hover:text-aui-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-aui-ring';

interface HunkProps {
  hunk: DiffHunk;
  file: ParsedFileDiff;
  order: number;
  total: number;
  view: DiffViewMode;
  decision: HunkDecision;
  active: boolean;
  readOnly: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
  onFocus: () => void;
  onDecide: (decision: HunkDecision) => void;
}

function Hunk({
  hunk,
  file,
  order,
  total,
  view,
  decision,
  active,
  readOnly,
  registerRef,
  onFocus,
  onDecide,
}: HunkProps) {
  const lastLine = hunk.newLines > 0 ? hunk.newStart + hunk.newLines - 1 : hunk.newStart;
  const name = `Hunk ${order + 1} of ${total}, ${file.path}, lines ${hunk.newStart} to ${lastLine}, ${decision === 'pending' ? 'not reviewed' : decision}`;
  return (
    // A roving-tabindex item: focus tracking only, all actions are buttons.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={registerRef}
      role="group"
      aria-label={name}
      tabIndex={active ? 0 : -1}
      data-slot="diff-hunk"
      data-decision={decision}
      onFocus={onFocus}
      className={cn(
        'border-aui-border/70 focus-visible:outline-aui-ring relative border-b last:border-b-0 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2',
        "before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-[3px] before:content-['']",
        decision === 'accepted' && 'before:bg-aui-accent',
        decision === 'rejected' && 'before:bg-aui-hot',
      )}
    >
      <div className="bg-aui-bg/35 flex min-h-9 items-center gap-2 py-1 pr-2 pl-4">
        <span className="font-aui-mono text-aui-fg-subtle min-w-0 truncate text-[11px]">{hunk.header}</span>
        {decision !== 'pending' && (
          <span
            className={cn(
              'font-aui-mono rounded-full px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase',
              decision === 'accepted' ? 'bg-aui-accent/15 text-aui-accent-fg' : 'bg-aui-hot/15 text-aui-hot-fg',
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
                onClick={() => onDecide('pending')}
                aria-label={`Reset hunk ${order + 1}`}
                className="text-aui-fg-subtle hover:bg-aui-surface-2 hover:text-aui-fg focus-visible:outline-aui-ring inline-flex size-7 cursor-pointer items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-1"
              >
                <UndoIcon size={13} />
              </button>
            )}
            <button
              type="button"
              aria-pressed={decision === 'rejected'}
              aria-label={`Reject hunk ${order + 1}`}
              onClick={() => onDecide(decision === 'rejected' ? 'pending' : 'rejected')}
              className={cn(
                hunkButton,
                decision === 'rejected'
                  ? 'border-aui-hot/60 bg-aui-hot/15 text-aui-hot-fg'
                  : 'border-aui-border text-aui-fg-muted hover:border-aui-hot/50 hover:text-aui-hot-fg',
              )}
            >
              <XIcon size={12} strokeWidth={2.5} />
              Reject
            </button>
            <button
              type="button"
              aria-pressed={decision === 'accepted'}
              aria-label={`Accept hunk ${order + 1}`}
              onClick={() => onDecide(decision === 'accepted' ? 'pending' : 'accepted')}
              className={cn(
                hunkButton,
                decision === 'accepted'
                  ? 'border-aui-accent/60 bg-aui-accent/15 text-aui-accent-fg'
                  : 'border-aui-border text-aui-fg-muted hover:border-aui-accent/50 hover:text-aui-accent-fg',
              )}
            >
              <CheckIcon size={12} strokeWidth={2.5} />
              Accept
            </button>
          </span>
        )}
      </div>
      <div className={cn('overflow-x-auto transition-opacity', decision === 'rejected' && 'opacity-55')}>
        {view === 'unified' ? (
          <div className="font-aui-mono min-w-max py-1 text-[12.5px] leading-[1.6]">
            {hunk.lines.map((line, i) => (
              <UnifiedRow key={i} line={line} language={file.language} rejected={decision === 'rejected'} />
            ))}
          </div>
        ) : (
          <SplitRows lines={hunk.lines} language={file.language} rejected={decision === 'rejected'} />
        )}
      </div>
    </div>
  );
}

const hunkButton =
  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-aui-ring';

const ROW_BG: Record<DiffLine['type'], string> = {
  context: '',
  add: 'bg-aui-add',
  del: 'bg-aui-del',
};
const SIGN: Record<DiffLine['type'], { glyph: string; sr: string; className: string }> = {
  context: { glyph: ' ', sr: '', className: '' },
  add: { glyph: '+', sr: 'Added: ', className: 'text-aui-accent-fg' },
  del: { glyph: '−', sr: 'Removed: ', className: 'text-aui-hot-fg' },
};

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
        rejected && line.type === 'add' && 'decoration-aui-hot/50 line-through',
      )}
    >
      <span className="sr-only">{SIGN[line.type].sr}</span>
      {pieces.map((p, i) => (
        <span
          key={i}
          className={cn(
            TOKEN_CLASS[p.kind],
            p.changed && 'rounded-[3px]',
            p.changed && (line.type === 'add' ? 'bg-aui-add-strong' : 'bg-aui-del-strong'),
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
      <span aria-hidden="true" className="text-aui-fg-subtle w-11 shrink-0 pr-2 text-right select-none">
        {line.oldNumber ?? ''}
      </span>
      <span aria-hidden="true" className="text-aui-fg-subtle w-11 shrink-0 pr-2 text-right select-none">
        {line.newNumber ?? ''}
      </span>
      <span aria-hidden="true" className={cn('w-5 shrink-0 text-center select-none', sign.className)}>
        {sign.glyph}
      </span>
      <LineContent line={line} language={language} rejected={rejected} />
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
  if (!line) return <div aria-hidden="true" className="bg-aui-bg/30" />;
  const number = side === 'left' ? line.oldNumber : line.newNumber;
  const sign = SIGN[line.type];
  return (
    <div data-line={line.type} aria-hidden={hidden || undefined} className={cn('flex min-w-0', ROW_BG[line.type])}>
      <span aria-hidden="true" className="text-aui-fg-subtle w-10 shrink-0 pr-2 text-right select-none">
        {number ?? ''}
      </span>
      <span aria-hidden="true" className={cn('w-4 shrink-0 text-center select-none', sign.className)}>
        {sign.glyph}
      </span>
      <LineContent line={line} language={language} rejected={rejected} wrap />
    </div>
  );
}

/** Split view: one shared grid so the two columns stay aligned; long lines wrap. */
function SplitRows({ lines, language, rejected }: { lines: readonly DiffLine[]; language: string; rejected: boolean }) {
  const rows = useMemo(() => toSplitRows(lines), [lines]);
  return (
    <div className="font-aui-mono grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] py-1 text-[12.5px] leading-[1.6]">
      {rows.map((row, i) => (
        <Fragment key={i}>
          <SplitCell line={row.left} side="left" language={language} rejected={rejected} />
          <span aria-hidden="true" className="bg-aui-border" />
          <SplitCell
            line={row.right}
            side="right"
            language={language}
            rejected={rejected}
            hidden={row.left !== undefined && row.left === row.right}
          />
        </Fragment>
      ))}
    </div>
  );
}
