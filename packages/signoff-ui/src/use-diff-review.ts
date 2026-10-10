'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import {
  DEFAULT_MAX_EDIT_LENGTH,
  parseWithin,
  type DiffHunk,
  type FileChange,
  type HunkDecision,
  type ParsedFileDiff,
} from './lib/diff';
import { defaultDiffWorker, parseInBackground, type DiffWorkerFactory } from './lib/diff-async';
import {
  changedSpan,
  computeReviewResult,
  contextGaps,
  fileDecision,
  hunkRange,
  linesRange,
  reviewItems,
  toPatch,
  type ContextGap,
  type DiffReviewComment,
  type DiffReviewResult,
  type FileDecision,
  type LineRange,
  type ReviewItem,
} from './lib/review';
import { useIsMac } from './lib/hooks';
import { diffReviewLabels, type SignoffLabelsInput } from './lib/labels';
import { useLabels } from './labels';
import { hasModifier, isPromiseLike, isTypingTarget } from './lib/utils';

/** The labels' sections this module reads. */
const LABELS = { diffReview: diffReviewLabels };

export type { DiffWorkerFactory } from './lib/diff-async';
export type {
  ContextGap,
  DiffReviewComment,
  DiffReviewResult,
  FileDecision,
  LineRange,
  ReviewItem,
} from './lib/review';

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
/** How many unchanged lines `E` and the gap buttons show at a time. */
export const CONTEXT_STEP = 20;

const sameChange = (a: FileChange, b: FileChange) =>
  a.path === b.path &&
  a.oldPath === b.oldPath &&
  a.oldContent === b.oldContent &&
  a.newContent === b.newContent &&
  a.patch === b.patch &&
  a.language === b.language &&
  a.binary === b.binary;

/** Equal when every key has the same value, counting a missing one as `fallback`. */
function sameRecord<T>(a: Readonly<Record<string, T>>, b: Readonly<Record<string, T>>, fallback: T) {
  if (a === b) return true;
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if ((a[id] ?? fallback) !== (b[id] ?? fallback)) return false;
  }
  return true;
}

const sameComments = (a: readonly DiffReviewComment[], b: readonly DiffReviewComment[]) =>
  a === b ||
  (a.length === b.length &&
    a.every((c, i) => {
      const d = b[i]!;
      return (
        c.id === d.id &&
        c.text === d.text &&
        c.fileId === d.fileId &&
        c.hunkId === d.hunkId &&
        c.target === d.target &&
        c.side === d.side &&
        c.startLine === d.startLine &&
        c.endLine === d.endLine
      );
    }));

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

/** State that is either the caller's (controlled) or the hook's own. */
function useControllable<T>(value: T | undefined, initial: () => T, onChange: ((next: T) => void) | undefined) {
  const [own, setOwn] = useState(initial);
  const current = value ?? own;
  const set = (next: T) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };
  return [current, set] as const;
}

export interface UseDiffReviewOptions {
  files: readonly FileChange[];
  /**
   * Controlled decisions keyed by item id: a hunk's `${path}:${index}`, or `${path}:file` for a file
   * with no hunks (binary, renamed or empty). A repeated path gets `${path}#2`, `#3` and so on,
   * skipping a suffix another file's path already has.
   */
  decisions?: Readonly<Record<string, HunkDecision>> | undefined;
  defaultDecisions?: Readonly<Record<string, HunkDecision>> | undefined;
  onDecisionsChange?: ((decisions: Record<string, HunkDecision>) => void) | undefined;
  /** Controlled comments. */
  comments?: readonly DiffReviewComment[] | undefined;
  defaultComments?: readonly DiffReviewComment[] | undefined;
  onCommentsChange?: ((comments: DiffReviewComment[]) => void) | undefined;
  /** Controlled "Viewed" marks, by file id (the path, or `path#2`… for a repeated path). */
  viewed?: Readonly<Record<string, boolean>> | undefined;
  defaultViewed?: Readonly<Record<string, boolean>> | undefined;
  onViewedChange?: ((viewed: Record<string, boolean>) => void) | undefined;
  /**
   * Called with the reviewed result, and a `toPatch` that gives the accepted changes as a unified
   * diff. Pending hunks are not applied. Fires once per review state, so a double click or a
   * repeated ⌘/Ctrl+Enter sends one review: submitting again needs a changed decision, comment or
   * viewed mark, changed `files`, the returned promise to settle, or the handler to throw. Files
   * compare by content and the rest by value: an equal new array or object does not count as a change.
   */
  onSubmit?: ((result: DiffReviewResult, review: { toPatch: () => string }) => void | PromiseLike<void>) | undefined;
  /** Decide nothing, comment on nothing: only read. */
  readOnly?: boolean | undefined;
  /** Lines of context around each change. Default 3. */
  context?: number | undefined;
  /**
   * Past this many lines added plus lines removed in one file, its changed region (from the first
   * changed line to the last) is shown as one hunk that replaces it, and the review says so. Diffing
   * costs about the square of this number. Default 2,000.
   */
  maxEditLength?: number | undefined;
  /**
   * Where files too large to diff while rendering are diffed: by default in the package's own
   * worker, which bundlers with worker support emit (webpack 5 and Next.js, Vite, Parcel). Pass a
   * function that starts your own `Worker` running `signoff-ui`'s diff worker, or `false` to diff
   * them on the main thread after the first paint. Without a working worker the latter is the fallback.
   */
  diffWorker?: DiffWorkerFactory | false | undefined;
  /** After accepting or rejecting with the keyboard, move to the next undecided item. Default `true`. */
  autoAdvance?: boolean | undefined;
  /** Fold a file away once it is marked viewed. Default `true`. */
  collapseViewed?: boolean | undefined;
  /** Words to use instead of the English defaults, for what the hook announces and names: see `SignoffLabelsProvider`. */
  labels?: SignoffLabelsInput | undefined;
}

export interface DiffReviewFileState {
  /** The file's id: its path, or `path#2`… for a path that repeats. */
  id: string;
  path: string;
  change: FileChange;
  /** `undefined` while the file is diffed in the background ("Comparing…"). */
  parsed: ParsedFileDiff | undefined;
  /** What it asks to decide: its hunks, or the file as a whole. */
  items: ReviewItem[];
  decision: FileDecision;
  /** How many of its items are decided. */
  decided: number;
  viewed: boolean;
  /** Folded away: its items are skipped by J and K. */
  collapsed: boolean;
  /** Unchanged lines around its hunks that can be shown, when both contents are known. */
  gaps: ContextGap[];
}

/** Lines selected in a hunk, by index into `hunk.lines`. */
export interface DiffReviewSelection {
  item: ReviewItem;
  hunk: DiffHunk;
  /** Where the selection started, and where it ends (the line moved with the keyboard). */
  anchor: number;
  head: number;
  /** The first and last selected index. */
  from: number;
  to: number;
  range: LineRange;
}

/** A comment being written: a new one, or an edit of `commentId`. */
export interface DiffReviewDraft {
  commentId?: string | undefined;
  fileId: string;
  target: DiffReviewComment['target'];
  hunkId?: string | undefined;
  range?: LineRange | undefined;
  text: string;
}

/** Unchanged lines shown in a gap: from its start (after the hunk above) and from its end. */
export interface ShownContext {
  start: number;
  end: number;
}

export interface UseDiffReviewResult {
  files: DiffReviewFileState[];
  /** Every item to decide, in file order; `index` in the getters refers to this list. */
  items: ReviewItem[];
  /** The item in the tab order, focused by J and K. */
  activeIndex: number;
  counts: { accepted: number; rejected: number; pending: number; total: number };
  /** Some file is still being diffed in the background; applying waits for it. */
  comparing: boolean;
  decisions: Readonly<Record<string, HunkDecision>>;
  comments: readonly DiffReviewComment[];
  viewed: Readonly<Record<string, boolean>>;
  selection: DiffReviewSelection | undefined;
  draft: DiffReviewDraft | undefined;
  /** Unchanged lines shown around hunks, by `${fileId}:${gap.before}`. */
  shown: Readonly<Record<string, ShownContext>>;
  /** What to announce: render it in a polite live region. */
  announcement: string;
  readOnly: boolean;
  isMac: boolean;

  decide(id: string, decision: HunkDecision, options?: { advance?: boolean }): void;
  decideFile(fileId: string, decision: Exclude<HunkDecision, 'pending'>): void;
  decideAll(decision: Exclude<HunkDecision, 'pending'>): void;
  setViewed(fileId: string, viewed: boolean): void;
  setCollapsed(fileId: string, collapsed: boolean): void;
  /** Focus an item by index (clamped), as J and K do. */
  focusItem(index: number): void;
  /** Make an item the one in the tab order, as focusing it does. Stable across renders. */
  activate(index: number): void;
  /** Record an item's element, for focus. Stable across renders. */
  registerItem(id: string, el: HTMLElement | null): void;
  /** Unfold a file and focus its first item, as the file navigator does. */
  focusFile(fileId: string): void;
  /** Select lines `from…to` of a hunk item; `to` defaults to `from`. */
  selectLines(itemId: string, from: number, to?: number): void;
  clearSelection(): void;
  /** Start a comment: on the selected lines, else on the item (a hunk or a whole file), or edit one. */
  startComment(options?: { itemId?: string; commentId?: string }): void;
  setDraftText(text: string): void;
  /** The comment editor's element, for focus. Stable across renders. */
  registerDraft(el: HTMLTextAreaElement | null): void;
  saveDraft(): void;
  cancelDraft(): void;
  removeComment(id: string): void;
  /** Show more unchanged lines of a file's gap: from its start, its end, or all of it. */
  showContext(fileId: string, gap: ContextGap, from: 'start' | 'end' | 'all'): void;
  /** Send the review to `onSubmit`, once per review state. */
  submit(): void;
  /** The review as `onSubmit` receives it, for the current state. */
  result(): DiffReviewResult;
  /** The accepted changes as a unified diff. */
  toPatch(): string;

  getRootProps(): { onKeyDown: (event: KeyboardEvent<HTMLElement>) => void };
  /** A focusable item: a roving tabindex, its accessible name and its decision. */
  getItemProps(index: number): {
    ref: (el: HTMLElement | null) => void;
    role: 'group';
    tabIndex: 0 | -1;
    'aria-label': string;
    'data-decision': HunkDecision;
    onFocus: () => void;
  };
  /** Accept or reject one item; pressing it again resets it. */
  getDecisionProps(
    index: number,
    decision: Exclude<HunkDecision, 'pending'>,
  ): { type: 'button'; 'aria-pressed': boolean; onClick: () => void };
  getFileDecisionProps(
    fileId: string,
    decision: Exclude<HunkDecision, 'pending'>,
  ): { type: 'button'; onClick: () => void; 'aria-keyshortcuts': string };
  getViewedProps(fileId: string): {
    ref: (el: HTMLInputElement | null) => void;
    type: 'checkbox';
    checked: boolean;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    'aria-keyshortcuts': 'V';
  };
  /** Click a line number to select it; Shift-click extends the selection in the same hunk. */
  getLineNumberProps(index: number, line: number): { onClick: (event: MouseEvent) => void };
  getDraftProps(): {
    ref: (el: HTMLTextAreaElement | null) => void;
    value: string;
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  };
  getSubmitProps(): {
    type: 'button';
    onClick: () => void;
    'aria-disabled': true | undefined;
    'aria-keyshortcuts': string;
  };
  /** One button per file in a navigator list, with a roving tabindex: ↑ and ↓ move, Enter goes. */
  getNavigatorItemProps(fileId: string): {
    type: 'button';
    tabIndex: 0 | -1;
    ref: (el: HTMLButtonElement | null) => void;
    'aria-current': true | undefined;
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  };
}

/**
 * The review without its markup: parsing (in a worker for large files), decisions, comments,
 * viewed files, unchanged context, the keyboard and the result, for teams that render their own.
 * `DiffReview` is this hook and its styled markup. Spread `getRootProps()` on the element that
 * contains the review, `getItemProps(i)` on each item's element, and render `announcement` in a
 * polite live region; the keys are DiffReview's.
 */
export function useDiffReview({
  files: changes,
  decisions: decisionsProp,
  defaultDecisions,
  onDecisionsChange,
  comments: commentsProp,
  defaultComments,
  onCommentsChange,
  viewed: viewedProp,
  defaultViewed,
  onViewedChange,
  onSubmit,
  readOnly = false,
  context = 3,
  maxEditLength = DEFAULT_MAX_EDIT_LENGTH,
  diffWorker = defaultDiffWorker,
  autoAdvance = true,
  collapseViewed = true,
  labels,
}: UseDiffReviewOptions): UseDiffReviewResult {
  const T = useLabels(LABELS, labels).diffReview;
  // Parsed by content rather than by `files` identity, so an inline array (a new one on every
  // parent render) does not re-diff every file on every decision.
  const [parsedFiles, setParsedFiles] = useState<ParsedFiles>(() => parseFiles(changes, context, maxEditLength));
  let current = parsedFiles;
  if (parsedFiles.files !== changes || parsedFiles.context !== context || parsedFiles.maxEditLength !== maxEditLength) {
    current = parseFiles(changes, context, maxEditLength, parsedFiles);
    setParsedFiles(current);
  }

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
    const { files: list, ids, parsed: results, context: ctx, maxEditLength: limit } = parsedFiles;
    results.forEach((result, i) => {
      if (result) return;
      const change = list[i]!;
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
          if (mounted.current) setFailure({ error });
        },
      );
    });
  }, [parsedFiles, diffWorker]);
  // A file that failed to diff in the background fails the render, as one diffed while rendering does.
  if (failure) throw failure.error;

  const [decisions, setDecisions] = useControllable(
    decisionsProp,
    () => ({ ...defaultDecisions }) as Readonly<Record<string, HunkDecision>>,
    onDecisionsChange as ((next: Readonly<Record<string, HunkDecision>>) => void) | undefined,
  );
  const [comments, setComments] = useControllable(
    commentsProp,
    () => [...(defaultComments ?? [])] as readonly DiffReviewComment[],
    onCommentsChange as ((next: readonly DiffReviewComment[]) => void) | undefined,
  );
  const [viewed, setViewedMap] = useControllable(
    viewedProp,
    () => ({ ...defaultViewed }) as Readonly<Record<string, boolean>>,
    onViewedChange as ((next: Readonly<Record<string, boolean>>) => void) | undefined,
  );
  const [folded, setFolded] = useState<Readonly<Record<string, boolean>>>({});
  const [shown, setShown] = useState<Readonly<Record<string, ShownContext>>>({});
  const [selectionState, setSelection] = useState<{ itemId: string; anchor: number; head: number }>();
  const [draft, setDraft] = useState<DiffReviewDraft>();
  const [announcement, setAnnouncement] = useState('');
  const [activeState, setActive] = useState(0);
  const [navActive, setNavActive] = useState<string>();
  const elements = useRef(new Map<string, HTMLElement>());
  const navElements = useRef(new Map<string, HTMLButtonElement>());
  const viewedElements = useRef(new Map<string, HTMLInputElement>());
  /** An item to focus once it is rendered: after unfolding a file, or closing a comment editor. */
  const pendingFocus = useRef<string | HTMLElement | undefined>(undefined);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const commentIds = useRef(0);
  const isMac = useIsMac();
  const [registerItem] = useState(() => (id: string, el: HTMLElement | null) => {
    if (el) elements.current.set(id, el);
    else elements.current.delete(id);
  });
  const [registerDraft] = useState(() => (el: HTMLTextAreaElement | null) => {
    draftRef.current = el;
  });

  const all = current.parsed;
  const comparing = all.some((p) => p === undefined);
  const parsed = useMemo(() => all.filter((p): p is ParsedFileDiff => p !== undefined), [all]);

  const files = useMemo<DiffReviewFileState[]>(
    () =>
      all.map((file, i) => {
        const items = file ? reviewItems(file) : [];
        const id = current.ids[i]!;
        const isViewed = viewed[id] === true;
        return {
          id,
          path: current.files[i]!.path,
          change: current.files[i]!,
          parsed: file,
          items,
          decision: fileDecision(items, decisions),
          decided: items.filter((item) => (decisions[item.id] ?? 'pending') !== 'pending').length,
          viewed: isViewed,
          collapsed: folded[id] ?? (collapseViewed && isViewed),
          gaps: file ? contextGaps(file) : [],
        };
      }),
    [all, current.ids, current.files, viewed, decisions, folded, collapseViewed],
  );
  const items = useMemo(() => files.flatMap((f) => f.items), [files]);
  const fileOf = useMemo(() => {
    const map = new Map<string, DiffReviewFileState>();
    for (const file of files) for (const item of file.items) map.set(item.id, file);
    return map;
  }, [files]);
  const indexOf = useMemo(() => new Map(items.map((item, i) => [item.id, i])), [items]);
  const navigable = (i: number) => !fileOf.get(items[i]?.id ?? '')?.collapsed;
  /** The next item from `index` (exclusive) in `step` direction that is not folded away. */
  const nextNavigable = (index: number, step: 1 | -1) => {
    for (let i = index + step; i >= 0 && i < items.length; i += step) if (navigable(i)) return i;
    return undefined;
  };
  // Clamped, so an item stays in the tab order when `files` shrinks below the active one, and moved
  // off a folded file to the nearest item that shows.
  const clamped = Math.min(activeState, Math.max(0, items.length - 1));
  const activeIndex = navigable(clamped)
    ? clamped
    : (nextNavigable(clamped, 1) ?? nextNavigable(clamped, -1) ?? clamped);

  const counts = useMemo(() => {
    let accepted = 0;
    let rejected = 0;
    for (const item of items) {
      const d = decisions[item.id];
      if (d === 'accepted') accepted++;
      else if (d === 'rejected') rejected++;
    }
    return { accepted, rejected, pending: items.length - accepted - rejected, total: items.length };
  }, [items, decisions]);

  const selection = useMemo<DiffReviewSelection | undefined>(() => {
    if (!selectionState) return undefined;
    const item = items[indexOf.get(selectionState.itemId) ?? -1];
    const hunk = item?.hunk;
    if (!item || !hunk) return undefined;
    const last = hunk.lines.length - 1;
    const anchor = Math.min(selectionState.anchor, last);
    const head = Math.min(selectionState.head, last);
    const from = Math.min(anchor, head);
    const to = Math.max(anchor, head);
    return { item, hunk, anchor, head, from, to, range: linesRange(hunk, from, to) };
  }, [selectionState, items, indexOf]);

  const result = () => computeReviewResult(parsed, decisions, { comments, viewed });
  const patch = () => toPatch(parsed, decisions);

  const focusItem = (index: number) => {
    const target = items[Math.max(0, Math.min(items.length - 1, index))];
    if (!target) return;
    setActive(indexOf.get(target.id)!);
    elements.current.get(target.id)?.focus();
  };
  const decide = (id: string, decision: HunkDecision, { advance = false }: { advance?: boolean } = {}) => {
    const index = indexOf.get(id);
    if (index === undefined) return;
    const next = { ...decisions, [id]: decision };
    setDecisions(next);
    const remaining = items.filter((item) => (next[item.id] ?? 'pending') === 'pending').length;
    const kind = items[index]!.hunk ? 'hunk' : 'file';
    setAnnouncement(T.decided(kind, index + 1, items.length, decision, remaining));
    if (advance && decision !== 'pending') {
      const pending = (i: number) => navigable(i) && (next[items[i]!.id] ?? 'pending') === 'pending';
      const after = items.findIndex((_, i) => i > index && pending(i));
      const wrap = after !== -1 ? after : items.findIndex((_, i) => pending(i));
      if (wrap !== -1) focusItem(wrap);
    }
  };

  const decideMany = (ids: readonly string[], decision: Exclude<HunkDecision, 'pending'>) => {
    const next = { ...decisions };
    for (const id of ids) next[id] = decision;
    setDecisions(next);
  };
  const decideAll = (decision: Exclude<HunkDecision, 'pending'>) => {
    if (comparing) return;
    decideMany(
      items.map((item) => item.id),
      decision,
    );
    setAnnouncement(T.decidedAll(items.length, decision));
  };
  const decideFile = (fileId: string, decision: Exclude<HunkDecision, 'pending'>) => {
    const file = files.find((f) => f.id === fileId);
    if (!file || file.items.length === 0) return;
    decideMany(
      file.items.map((item) => item.id),
      decision,
    );
    setAnnouncement(T.decidedFile(file.items.length, file.path, decision));
  };

  const setCollapsed = (fileId: string, collapsed: boolean) => setFolded({ ...folded, [fileId]: collapsed });
  const setViewed = (fileId: string, value: boolean) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;
    const next = { ...viewed, [fileId]: value };
    setViewedMap(next);
    // A file folds with its viewed mark again, until it is folded or unfolded by hand.
    const rest = { ...folded };
    delete rest[fileId];
    setFolded(rest);
    const count = files.filter((f) => next[f.id] === true).length;
    setAnnouncement(value ? T.viewedAnnouncement(file.path, count, files.length) : T.notViewedAnnouncement(file.path));
  };

  const focusFile = (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    const first = file?.items[0];
    if (!file || !first) return;
    if (file.collapsed) setFolded({ ...folded, [fileId]: false });
    setActive(indexOf.get(first.id)!);
    // Unfolding renders the file's items first; focus them once they are in the page.
    pendingFocus.current = first.id;
    elements.current.get(first.id)?.focus();
  };
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = undefined;
    const el = typeof target === 'string' ? elements.current.get(target) : target;
    if (el && document.activeElement !== el) el.focus();
  });

  const announceSelection = (item: ReviewItem, anchor: number, head: number) => {
    const hunk = item.hunk!;
    const line = hunk.lines[head];
    if (line) {
      const spoken = `${line.type === 'add' ? T.added : line.type === 'del' ? T.removed : ''}${line.content}`;
      setAnnouncement(T.selected(spoken, linesRange(hunk, anchor, head)));
    }
  };
  const selectLines = (itemId: string, from: number, to = from) => {
    const item = items[indexOf.get(itemId) ?? -1];
    if (!item?.hunk) return;
    setSelection({ itemId, anchor: from, head: to });
    announceSelection(item, from, to);
  };
  const clearSelection = () => setSelection(undefined);

  /** Move or extend the selection in the focused hunk by a line, or start one. */
  const stepSelection = (item: ReviewItem, step: 1 | -1, extend: boolean) => {
    const hunk = item.hunk;
    if (!hunk) return;
    const last = hunk.lines.length - 1;
    const mine = selection?.item.id === item.id ? selection : undefined;
    if (!mine) {
      const [first, end] = changedSpan(hunk);
      const start = step === 1 ? first : end;
      selectLines(item.id, start, start);
      return;
    }
    const head = Math.max(0, Math.min(last, mine.head + step));
    const anchor = extend ? mine.anchor : head;
    selectLines(item.id, anchor, head);
  };

  const startComment = ({ itemId, commentId }: { itemId?: string; commentId?: string } = {}) => {
    if (readOnly) return;
    if (commentId) {
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return;
      setDraft({
        commentId,
        fileId: comment.fileId,
        target: comment.target,
        hunkId: comment.hunkId,
        range:
          comment.side && comment.startLine !== undefined && comment.endLine !== undefined
            ? { side: comment.side, startLine: comment.startLine, endLine: comment.endLine }
            : undefined,
        text: comment.text,
      });
      return;
    }
    const item = items[itemId ? (indexOf.get(itemId) ?? -1) : activeIndex];
    if (!item) return;
    const file = fileOf.get(item.id)!;
    if (!item.hunk) {
      setDraft({ fileId: file.id, target: 'file', text: '' });
    } else if (selection?.item.id === item.id) {
      setDraft({ fileId: file.id, target: 'lines', hunkId: item.id, range: selection.range, text: '' });
    } else {
      setDraft({ fileId: file.id, target: 'hunk', hunkId: item.id, range: hunkRange(item.hunk), text: '' });
    }
  };
  useEffect(() => {
    if (draft && document.activeElement !== draftRef.current) draftRef.current?.focus();
    // Only when a draft opens, not on every keystroke in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.commentId, draft?.hunkId, draft?.fileId, draft?.target, draft?.range?.startLine, draft?.range?.endLine]);

  /** Back to the item a comment was on, once its editor goes away. */
  const refocus = (fileId: string, hunkId: string | undefined) => {
    const id = hunkId ?? files.find((f) => f.id === fileId)?.items[0]?.id;
    if (id) pendingFocus.current = id;
  };
  const cancelDraft = () => {
    if (!draft) return;
    refocus(draft.fileId, draft.hunkId);
    setDraft(undefined);
  };
  const saveDraft = () => {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) return cancelDraft();
    const file = files.find((f) => f.id === draft.fileId);
    if (draft.commentId) {
      setComments(comments.map((c) => (c.id === draft.commentId ? { ...c, text } : c)));
      setAnnouncement(T.commentUpdated);
    } else {
      // Unique among the comments already there, controlled ones included.
      let id: string;
      do id = `comment-${++commentIds.current}`;
      while (comments.some((c) => c.id === id));
      const comment: DiffReviewComment = {
        id,
        fileId: draft.fileId,
        path: file?.path ?? draft.fileId,
        target: draft.target,
        ...(draft.hunkId ? { hunkId: draft.hunkId } : {}),
        ...(draft.range ? draft.range : {}),
        text,
      };
      setComments([...comments, comment]);
      setAnnouncement(T.commentAdded(T.where(comment), comment.path));
    }
    setSelection(undefined);
    refocus(draft.fileId, draft.hunkId);
    setDraft(undefined);
  };
  const removeComment = (id: string) => {
    const comment = comments.find((c) => c.id === id);
    if (!comment) return;
    setComments(comments.filter((c) => c.id !== id));
    setAnnouncement(T.commentDeleted);
    refocus(comment.fileId, comment.hunkId);
  };

  const showContext = (fileId: string, gap: ContextGap, from: 'start' | 'end' | 'all') => {
    const key = `${fileId}:${gap.before}`;
    const size = gap.oldEnd - gap.oldStart + 1;
    const now = shown[key] ?? { start: 0, end: 0 };
    const hidden = size - now.start - now.end;
    if (hidden <= 0) return;
    const step = from === 'all' ? hidden : Math.min(CONTEXT_STEP, hidden);
    const next = from === 'end' ? { ...now, end: now.end + step } : { ...now, start: now.start + step };
    setShown({ ...shown, [key]: next });
    setAnnouncement(T.expanded(step));
  };
  /** `E`: more unchanged lines above and below a hunk. */
  const showAround = (item: ReviewItem) => {
    const file = fileOf.get(item.id);
    if (!file || !item.hunk) return;
    const next = { ...shown };
    let added = 0;
    for (const gap of file.gaps) {
      const key = `${file.id}:${gap.before}`;
      const now = next[key] ?? { start: 0, end: 0 };
      const hidden = gap.oldEnd - gap.oldStart + 1 - now.start - now.end;
      const step = Math.min(CONTEXT_STEP, hidden);
      if (step <= 0) continue;
      // The gap above the hunk ends at it; the gap below starts at it.
      if (gap.before === item.hunk.index) next[key] = { ...now, end: now.end + step };
      else if (gap.before === item.hunk.index + 1) next[key] = { ...now, start: now.start + step };
      else continue;
      added += step;
    }
    if (added === 0) return;
    setShown(next);
    setAnnouncement(T.expanded(added));
  };

  // One submission per review state, so a double click or a repeated Ctrl+Enter sends it once.
  // Re-armed when the files change by content, or a decision, comment or viewed mark by value: an
  // equal `files` array or controlled object passed on every render must not re-arm it.
  const submitted = useRef(false);
  const reviewed = useRef({ parsed, decisions, comments, viewed });
  useEffect(() => {
    const before = reviewed.current;
    if (
      before.parsed !== parsed ||
      !sameRecord(before.decisions, decisions, 'pending') ||
      !sameComments(before.comments, comments) ||
      !sameRecord(before.viewed, viewed, false)
    )
      submitted.current = false;
    reviewed.current = { parsed, decisions, comments, viewed };
  }, [parsed, decisions, comments, viewed]);
  const submit = () => {
    // Every file has to be compared before the review means anything.
    if (!onSubmit || submitted.current || comparing || readOnly) return;
    submitted.current = true;
    let returned: void | PromiseLike<void>;
    try {
      returned = onSubmit(result(), { toPatch: patch });
    } catch (error) {
      // A failed handler sent nothing: let the user try again.
      submitted.current = false;
      throw error;
    }
    if (isPromiseLike(returned)) {
      void Promise.resolve(returned).finally(() => {
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
    const target = event.target as Node;
    const index = items.findIndex((item) => elements.current.get(item.id)?.contains(target));
    const inside = index !== -1;
    const item = items[inside ? index : activeIndex];
    const key = event.key;
    // Alt+A, Alt+R: the whole file. By key position, since Option on a Mac types another character.
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && inside && item) {
      if (event.code === 'KeyA' || event.code === 'KeyR') {
        event.preventDefault();
        decideFile(fileOf.get(item.id)!.id, event.code === 'KeyA' ? 'accepted' : 'rejected');
      }
      return;
    }
    if (hasModifier(event)) return;
    const mine = inside && selection?.item.id === item?.id;
    if (key === 'Escape' && selection) {
      event.preventDefault();
      clearSelection();
      return;
    }
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      // Arrow keys only act when an item (not e.g. the view toggle) has focus.
      if (!inside || !item) return;
      event.preventDefault();
      const step = key === 'ArrowDown' ? 1 : -1;
      if (event.shiftKey || mine) stepSelection(item, step, event.shiftKey);
      else {
        const next = nextNavigable(index, step);
        if (next !== undefined) focusItem(next);
      }
      return;
    }
    // Shift+J is "J" in a browser, and "j" with Shift from some keyboard drivers and test tools.
    const letter = key.length === 1 ? key.toLowerCase() : key;
    if ((letter === 'j' || letter === 'k') && !event.shiftKey) {
      event.preventDefault();
      clearSelection();
      if (!inside) return focusItem(activeIndex);
      const next = nextNavigable(index, letter === 'j' ? 1 : -1);
      if (next !== undefined) focusItem(next);
      return;
    }
    if (letter === 'j' || letter === 'k') {
      // The first item of the next or previous file that is not folded away.
      event.preventDefault();
      clearSelection();
      const here = fileOf.get(item?.id ?? '');
      const at = files.indexOf(here!);
      const step = letter === 'j' ? 1 : -1;
      for (let f = at + step; f >= 0 && f < files.length; f += step) {
        const first = files[f]!.items[0];
        if (first && !files[f]!.collapsed) return focusItem(indexOf.get(first.id)!);
      }
      return;
    }
    if (event.shiftKey && (letter === 'a' || letter === 'r')) {
      event.preventDefault();
      decideAll(letter === 'a' ? 'accepted' : 'rejected');
      return;
    }
    if (!item || !inside || event.shiftKey) return;
    if (key === 'a') {
      event.preventDefault();
      decide(item.id, 'accepted', { advance: autoAdvance });
    } else if (key === 'r' || key === 'x') {
      event.preventDefault();
      decide(item.id, 'rejected', { advance: autoAdvance });
    } else if (key === 'u') {
      event.preventDefault();
      decide(item.id, 'pending');
    } else if (key === 'c') {
      event.preventDefault();
      startComment({ itemId: item.id });
    } else if (key === 'e') {
      event.preventDefault();
      showAround(item);
    } else if (key === 'v') {
      event.preventDefault();
      const file = fileOf.get(item.id)!;
      const marking = !file.viewed;
      setViewed(file.id, marking);
      if (marking && collapseViewed) {
        // Folded away: go on to the next file's first item, or after the last file, to its checkbox.
        const next = files.slice(files.indexOf(file) + 1).find((f) => !f.collapsed && f.items[0]);
        if (next) focusItem(indexOf.get(next.items[0]!.id)!);
        else pendingFocus.current = viewedElements.current.get(file.id);
      }
    }
  };

  const navOrder = files.filter((f) => f.items.length > 0).map((f) => f.id);
  const navCurrent =
    navActive && navOrder.includes(navActive) ? navActive : fileOf.get(items[activeIndex]?.id ?? '')?.id;

  const review: UseDiffReviewResult = {
    files,
    items,
    activeIndex,
    counts,
    comparing,
    decisions,
    comments,
    viewed,
    selection,
    draft,
    shown,
    announcement,
    readOnly,
    isMac,
    decide,
    decideFile,
    decideAll,
    setViewed,
    setCollapsed,
    focusItem,
    activate: setActive,
    registerItem,
    focusFile,
    selectLines,
    clearSelection,
    startComment,
    setDraftText: (text) => setDraft((d) => d && { ...d, text }),
    registerDraft,
    saveDraft,
    cancelDraft,
    removeComment,
    showContext,
    submit,
    result,
    toPatch: patch,
    getRootProps: () => ({ onKeyDown }),
    getItemProps: (index) => {
      const item = items[index]!;
      const file = fileOf.get(item.id)!;
      const decision = decisions[item.id] ?? 'pending';
      const hunk = item.hunk;
      const name = hunk
        ? T.hunk(
            index + 1,
            items.length,
            file.path,
            hunk.newStart,
            hunk.newLines > 0 ? hunk.newStart + hunk.newLines - 1 : hunk.newStart,
            decision,
          )
        : T.fileItem(
            index + 1,
            items.length,
            file.path,
            T.describeFile(item.file.status, !!item.file.binary, item.file.oldPath ?? item.file.path),
            decision,
          );
      return {
        ref: (el: HTMLElement | null) => registerItem(item.id, el),
        role: 'group' as const,
        tabIndex: index === activeIndex ? 0 : -1,
        'aria-label': name,
        'data-decision': decision,
        onFocus: () => setActive(index),
      };
    },
    getDecisionProps: (index, decision) => {
      const item = items[index]!;
      const pressed = (decisions[item.id] ?? 'pending') === decision;
      return {
        type: 'button' as const,
        'aria-pressed': pressed,
        onClick: () => decide(item.id, pressed ? 'pending' : decision),
      };
    },
    getFileDecisionProps: (fileId, decision) => ({
      type: 'button' as const,
      onClick: () => decideFile(fileId, decision),
      'aria-keyshortcuts': decision === 'accepted' ? 'Alt+A' : 'Alt+R',
    }),
    getViewedProps: (fileId) => ({
      ref: (el: HTMLInputElement | null) => {
        if (el) viewedElements.current.set(fileId, el);
        else viewedElements.current.delete(fileId);
      },
      type: 'checkbox' as const,
      checked: viewed[fileId] === true,
      onChange: (event) => setViewed(fileId, event.target.checked),
      'aria-keyshortcuts': 'V' as const,
    }),
    getLineNumberProps: (index, line) => ({
      onClick: (event) => {
        const item = items[index];
        if (!item?.hunk || readOnly) return;
        const extend = event.shiftKey && selection?.item.id === item.id;
        selectLines(item.id, extend ? selection.anchor : line, line);
        setActive(index);
        elements.current.get(item.id)?.focus({ preventScroll: true });
      },
    }),
    getDraftProps: () => ({
      ref: registerDraft,
      value: draft?.text ?? '',
      onChange: (event) => {
        const text = event.target.value;
        setDraft((d) => d && { ...d, text });
      },
      onKeyDown: (event) => {
        // The Enter that commits an IME composition (Japanese, Chinese, Korean…) is not a submit.
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.stopPropagation();
          saveDraft();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelDraft();
        }
      },
    }),
    getSubmitProps: () => ({
      type: 'button' as const,
      onClick: submit,
      'aria-disabled': comparing || undefined,
      'aria-keyshortcuts': isMac ? 'Meta+Enter' : 'Control+Enter',
    }),
    getNavigatorItemProps: (fileId) => ({
      type: 'button' as const,
      tabIndex: fileId === (navCurrent ?? navOrder[0]) ? 0 : -1,
      ref: (el: HTMLButtonElement | null) => {
        if (el) navElements.current.set(fileId, el);
        else navElements.current.delete(fileId);
      },
      'aria-current': fileId === fileOf.get(items[activeIndex]?.id ?? '')?.id || undefined,
      onClick: () => focusFile(fileId),
      onKeyDown: (event) => {
        const at = navOrder.indexOf(fileId);
        const to =
          event.key === 'ArrowDown'
            ? at + 1
            : event.key === 'ArrowUp'
              ? at - 1
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? navOrder.length - 1
                  : undefined;
        if (to === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        const id = navOrder[Math.max(0, Math.min(navOrder.length - 1, to))]!;
        setNavActive(id);
        navElements.current.get(id)?.focus();
      },
    }),
  };
  return review;
}
