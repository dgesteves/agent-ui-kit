/**
 * What a review is made of beyond the diff: the decisions it asks for, comments on lines and
 * hunks, unchanged lines that can be shown around a hunk, the result the agent gets back, and that
 * result as a unified patch, an AI SDK tool output or an AG-UI resume entry. Pure, with no React.
 */
import { formatPatch, type StructuredPatch } from 'diff';
import {
  applyHunks,
  type DiffHunk,
  type DiffLine,
  type FileStatus,
  type HunkDecision,
  type ParsedFileDiff,
} from './diff';

/** The id of a file's one decision when it has no hunks to decide: `${fileId}:file`. */
export function fileItemId(fileId: string): string {
  return `${fileId}:file`;
}

/** One thing to decide: a hunk, or a file with no hunks as a whole (binary, a rename, an empty file). */
export interface ReviewItem {
  /** The decision key: the hunk's id, or `${fileId}:file`. */
  id: string;
  file: ParsedFileDiff;
  /** `undefined` for a whole file. */
  hunk: DiffHunk | undefined;
}

/** What a file asks to be decided: its hunks, or the file itself when it has none but changed. */
export function reviewItems(file: ParsedFileDiff): ReviewItem[] {
  if (file.hunks.length > 0) return file.hunks.map((hunk) => ({ id: hunk.id, file, hunk }));
  if (file.binary || file.status !== 'modified') return [{ id: fileItemId(file.id), file, hunk: undefined }];
  return [];
}

export type CommentSide = 'new' | 'old';

/** A reviewer's comment for the agent, on lines of a hunk, a whole hunk or a whole file. */
export interface DiffReviewComment {
  /** Unique within the review. */
  id: string;
  /** The file's id in the review: its path, or `path#2`… for a path that repeats. */
  fileId: string;
  path: string;
  /** What it is on. */
  target: 'lines' | 'hunk' | 'file';
  /** The hunk the lines are in, for `lines` and `hunk`. */
  hunkId?: string | undefined;
  /**
   * Which file the line numbers count in: the proposed one (`new`), or for removed lines only,
   * the original (`old`). Absent for a comment on a whole file.
   */
  side?: CommentSide | undefined;
  startLine?: number | undefined;
  endLine?: number | undefined;
  text: string;
}

export interface LineRange {
  side: CommentSide;
  startLine: number;
  endLine: number;
}

const number = (line: DiffLine, side: CommentSide) => (side === 'new' ? line.newNumber : line.oldNumber);

/**
 * The line range of `hunk.lines[from…to]`: numbered in the proposed file when any of them is in
 * it, else (removed lines only) in the original.
 */
export function linesRange(hunk: DiffHunk, from: number, to: number): LineRange {
  const lines = hunk.lines.slice(Math.min(from, to), Math.max(from, to) + 1);
  for (const side of ['new', 'old'] as const) {
    const numbers = lines.map((l) => number(l, side)).filter((n): n is number => n !== undefined);
    if (numbers.length > 0) return { side, startLine: numbers[0]!, endLine: numbers.at(-1)! };
  }
  return { side: 'new', startLine: hunk.newStart, endLine: hunk.newStart };
}

/** Indices of a hunk's first and last changed line. */
export function changedSpan(hunk: DiffHunk): [number, number] {
  const first = hunk.lines.findIndex((l) => l.type !== 'context');
  if (first === -1) return [0, Math.max(0, hunk.lines.length - 1)];
  let last = hunk.lines.length - 1;
  while (last > first && hunk.lines[last]!.type === 'context') last--;
  return [first, last];
}

/** The range a comment on the whole hunk refers to: its changed lines. */
export function hunkRange(hunk: DiffHunk): LineRange {
  const [first, last] = changedSpan(hunk);
  return linesRange(hunk, first, last);
}

/** Indices of the lines a comment covers in its hunk, or `undefined` when they are not in it. */
export function commentSpan(hunk: DiffHunk, comment: DiffReviewComment): [number, number] | undefined {
  if (comment.target === 'hunk') return changedSpan(hunk);
  const { side, startLine, endLine } = comment;
  if (side === undefined || startLine === undefined || endLine === undefined) return undefined;
  const from = hunk.lines.findIndex((l) => number(l, side) === startLine);
  let to = -1;
  hunk.lines.forEach((l, i) => {
    if (number(l, side) === endLine) to = i;
  });
  return from === -1 || to === -1 || to < from ? undefined : [from, to];
}

const SIGN: Record<DiffLine['type'], string> = { context: ' ', add: '+', del: '-' };
const MAX_EXCERPT_LINES = 40;

/** Lines as a unified diff: ` ` unchanged, `-` removed, `+` added. Long runs are cut short with `…`. */
function diffText(lines: readonly DiffLine[]) {
  const shown = lines.slice(0, MAX_EXCERPT_LINES).map((l) => SIGN[l.type] + l.content);
  if (lines.length > MAX_EXCERPT_LINES) shown.push(`… ${lines.length - MAX_EXCERPT_LINES} more lines`);
  return shown.join('\n');
}

/** A gap of unchanged lines between hunks (or before the first, or after the last) that can be shown. */
export interface ContextGap {
  /** The hunk after the gap; the file's hunk count for the gap at its end. */
  before: number;
  /** The gap's first and last line in the original file, 1-based and inclusive. */
  oldStart: number;
  oldEnd: number;
  /** Add to a line's number in the original for its number in the proposed file. */
  delta: number;
}

const lineCount = (text: string) => (text === '' ? 0 : text.replace(/\n$/, '').split('\n').length);

/** The unchanged lines around a file's hunks. Only with both contents: a patch alone has none. */
export function contextGaps(file: ParsedFileDiff): ContextGap[] {
  if (file.oldContent === undefined || file.newContent === undefined || file.binary || file.hunks.length === 0)
    return [];
  const gaps: ContextGap[] = [];
  let next = 1;
  let delta = 0;
  file.hunks.forEach((hunk, i) => {
    // jsdiff numbers a hunk with no original lines by the line it goes before, so this holds for all.
    if (hunk.oldStart - 1 >= next) gaps.push({ before: i, oldStart: next, oldEnd: hunk.oldStart - 1, delta });
    next = hunk.oldStart + hunk.oldLines;
    delta = hunk.newStart + hunk.newLines - next;
  });
  const total = lineCount(file.oldContent);
  if (total >= next) gaps.push({ before: file.hunks.length, oldStart: next, oldEnd: total, delta });
  return gaps;
}

/** A file's original lines, split once. */
const originalLines = new WeakMap<ParsedFileDiff, string[]>();

/** The unchanged lines `oldStart…oldEnd` of a gap, as context lines numbered in both files. */
export function gapLines(file: ParsedFileDiff, gap: ContextGap, oldStart: number, oldEnd: number): DiffLine[] {
  let lines = originalLines.get(file);
  if (!lines) originalLines.set(file, (lines = (file.oldContent ?? '').split('\n')));
  const out: DiffLine[] = [];
  for (let n = Math.max(oldStart, gap.oldStart); n <= Math.min(oldEnd, gap.oldEnd); n++) {
    out.push({ type: 'context', content: lines[n - 1] ?? '', oldNumber: n, newNumber: n + gap.delta });
  }
  return out;
}

/** How a file came out of the review. `partial`: some of its changes were accepted, not all. */
export type FileDecision = 'accepted' | 'rejected' | 'partial' | 'pending' | 'unchanged';

export interface DiffReviewFileResult {
  path: string;
  /** The path before, for a renamed file. */
  oldPath?: string | undefined;
  status: FileStatus;
  binary?: true | undefined;
  /**
   * `accepted` when every change was accepted, `rejected` when every one was, `partial` for some of
   * each or some left undecided, `pending` when none was decided, `unchanged` with nothing to decide.
   */
  decision: FileDecision;
  /** Marked "Viewed" by the reviewer. */
  viewed: boolean;
  /** File contents with only accepted hunks applied. `undefined` for patch-only input. */
  content: string | undefined;
  accepted: string[];
  rejected: string[];
  pending: string[];
}

/** A hunk the reviewer turned down, with its lines, so the agent knows exactly what not to do. */
export interface DiffReviewRejectedHunk {
  id: string;
  path: string;
  header: string;
  /** The hunk as unified diff lines: ` ` unchanged, `-` removed, `+` added. */
  diff: string;
}

export interface DiffReviewResultComment extends DiffReviewComment {
  /** The lines commented on, as unified diff lines, when they are in the review. */
  excerpt?: string | undefined;
}

export interface DiffReviewResult {
  files: DiffReviewFileResult[];
  /** Decisions across the review: hunks, and files decided as a whole. */
  accepted: number;
  rejected: number;
  pending: number;
  rejectedHunks: DiffReviewRejectedHunk[];
  comments: DiffReviewResultComment[];
}

export function fileDecision(items: readonly ReviewItem[], decisions: Readonly<Record<string, HunkDecision>>) {
  if (items.length === 0) return 'unchanged' as const;
  const states = new Set(items.map((item) => decisions[item.id] ?? 'pending'));
  if (states.size === 1) return [...states][0] as 'accepted' | 'rejected' | 'pending';
  return 'partial' as const;
}

/** Compute the review result for a set of parsed files, decisions, comments and viewed files. */
export function computeReviewResult(
  files: readonly ParsedFileDiff[],
  decisions: Readonly<Record<string, HunkDecision>>,
  {
    comments = [],
    viewed = {},
  }: { comments?: readonly DiffReviewComment[]; viewed?: Readonly<Record<string, boolean>> } = {},
): DiffReviewResult {
  const rejectedHunks: DiffReviewRejectedHunk[] = [];
  const out: DiffReviewFileResult[] = files.map((file) => {
    const items = reviewItems(file);
    const pick = (d: HunkDecision) => items.filter((item) => (decisions[item.id] ?? 'pending') === d).map((i) => i.id);
    const accepted = pick('accepted');
    for (const hunk of file.hunks) {
      if (decisions[hunk.id] === 'rejected')
        rejectedHunks.push({ id: hunk.id, path: file.path, header: hunk.header, diff: diffText(hunk.lines) });
    }
    const known = file.oldContent !== undefined && file.newContent !== undefined;
    // A file decided as a whole is its proposed contents once accepted, its original otherwise.
    const whole = items.length === 1 && items[0]!.hunk === undefined;
    const content = !known
      ? undefined
      : whole
        ? accepted.length > 0
          ? file.newContent
          : file.oldContent
        : applyHunks(file, accepted);
    return {
      path: file.path,
      ...(file.oldPath !== undefined && file.oldPath !== file.path ? { oldPath: file.oldPath } : {}),
      status: file.status,
      ...(file.binary ? { binary: true as const } : {}),
      decision: fileDecision(items, decisions),
      viewed: viewed[file.id] === true,
      content,
      accepted,
      rejected: pick('rejected'),
      pending: pick('pending'),
    };
  });
  const byId = new Map(files.map((file) => [file.id, file]));
  return {
    files: out,
    accepted: out.reduce((n, f) => n + f.accepted.length, 0),
    rejected: out.reduce((n, f) => n + f.rejected.length, 0),
    pending: out.reduce((n, f) => n + f.pending.length, 0),
    rejectedHunks,
    comments: comments.map((comment) => {
      const hunk = byId.get(comment.fileId)?.hunks.find((h) => h.id === comment.hunkId);
      const span = hunk && commentSpan(hunk, comment);
      return span ? { ...comment, excerpt: diffText(hunk.lines.slice(span[0], span[1] + 1)) } : { ...comment };
    }),
  };
}

const NO_NEWLINE = '\\ No newline at end of file';

function patchLines(hunk: DiffHunk): string[] {
  return hunk.lines.flatMap((line) => {
    const text = SIGN[line.type] + line.content;
    return line.noNewline ? [text, NO_NEWLINE] : [text];
  });
}

/**
 * The accepted changes as a git-style unified diff, from the original files: `git apply` and
 * `patch -p1` read it. Rejected and undecided changes are left out, and the hunks after them are
 * renumbered to match. A binary file accepted is listed as changed, without its contents.
 */
export function toPatch(files: readonly ParsedFileDiff[], decisions: Readonly<Record<string, HunkDecision>>): string {
  const out: string[] = [];
  for (const file of files) {
    const items = reviewItems(file);
    const accepted = items.filter((item) => decisions[item.id] === 'accepted');
    if (accepted.length === 0) continue;
    const oldPath = file.oldPath ?? file.path;
    const added = file.status === 'added';
    const deleted = file.status === 'deleted';
    if (file.binary) {
      out.push(
        `diff --git a/${oldPath} b/${file.path}\n` +
          (added ? 'new file mode 100644\n' : deleted ? 'deleted file mode 100644\n' : '') +
          `Binary files ${added ? '/dev/null' : `a/${oldPath}`} and ${deleted ? '/dev/null' : `b/${file.path}`} differ\n`,
      );
      continue;
    }
    let offset = 0;
    const hunks = accepted
      .flatMap((item) => (item.hunk ? [item.hunk] : []))
      .map((hunk) => {
        const renumbered = {
          oldStart: hunk.oldStart,
          oldLines: hunk.oldLines,
          newStart: hunk.oldStart + offset,
          newLines: hunk.newLines,
          lines: patchLines(hunk),
        };
        offset += hunk.newLines - hunk.oldLines;
        return renumbered;
      });
    const patch: StructuredPatch = {
      oldFileName: added ? '/dev/null' : `a/${oldPath}`,
      newFileName: deleted ? '/dev/null' : `b/${file.path}`,
      oldHeader: undefined,
      newHeader: undefined,
      hunks,
      isGit: true,
      ...(added ? { isCreate: true } : {}),
      ...(deleted ? { isDelete: true } : {}),
      ...(file.status === 'renamed' ? { isRename: true } : {}),
    };
    out.push(formatPatch(patch));
  }
  return out.join('');
}

/** The review as the agent reads it, for `addToolOutput` (AI SDK) or an AG-UI resume payload. */
export interface DiffReviewToolOutput {
  /** One sentence: what was applied, rejected, left undecided and commented. */
  summary: string;
  /** Decisions across the review: hunks, and files decided as a whole. */
  accepted: number;
  rejected: number;
  pending: number;
  files: Array<{
    path: string;
    oldPath?: string;
    status: FileStatus;
    decision: FileDecision;
    /** With `contents` (the default): the file with only the accepted hunks applied. */
    content?: string;
  }>;
  rejectedHunks: Array<{ path: string; header: string; diff: string }>;
  comments: Array<{
    path: string;
    side?: CommentSide;
    startLine?: number;
    endLine?: number;
    text: string;
    excerpt?: string;
  }>;
  /** With `patch`: the accepted changes as a unified diff. */
  patch?: string;
}

export interface DiffReviewToolOutputOptions {
  /** Include each file's contents as applied. Default `true`; turn off when sending a `patch`. */
  contents?: boolean;
  /** A unified diff of the accepted changes, e.g. `toPatch()` from `onSubmit`'s second argument. */
  patch?: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function summarize(result: DiffReviewResult) {
  const total = result.accepted + result.rejected + result.pending;
  const changed = result.files.filter((f) => f.accepted.length > 0).length;
  const parts = [
    `Applied ${result.accepted} of ${plural(total, 'change')}${changed ? ` in ${plural(changed, 'file')}` : ''}`,
  ];
  if (result.rejected) parts.push(`rejected ${result.rejected}`);
  if (result.pending) parts.push(`left ${result.pending} undecided`);
  const comments = result.comments.length ? ` The reviewer left ${plural(result.comments.length, 'comment')}.` : '';
  return `${parts.join(', ')}.${comments}`;
}

/**
 * A review result shaped for the agent: a one-line summary, each file's decision (and contents, by
 * default), the rejected hunks with their lines, and every comment with its lines. JSON, so it is
 * an AI SDK tool output as it is: `addToolOutput({ tool, toolCallId, output: reviewToolOutput(result) })`.
 * The summary is written in English for the model, whatever language the UI is in.
 */
export function reviewToolOutput(
  result: DiffReviewResult,
  { contents = true, patch }: DiffReviewToolOutputOptions = {},
): DiffReviewToolOutput {
  return {
    summary: summarize(result),
    accepted: result.accepted,
    rejected: result.rejected,
    pending: result.pending,
    files: result.files.map((file) => ({
      path: file.path,
      ...(file.oldPath ? { oldPath: file.oldPath } : {}),
      status: file.status,
      decision: file.decision,
      ...(contents && file.content !== undefined ? { content: file.content } : {}),
    })),
    rejectedHunks: result.rejectedHunks.map(({ path, header, diff }) => ({ path, header, diff })),
    comments: result.comments.map(({ path, side, startLine, endLine, text, excerpt }) => ({
      path,
      ...(side ? { side } : {}),
      ...(startLine !== undefined ? { startLine } : {}),
      ...(endLine !== undefined ? { endLine } : {}),
      text,
      ...(excerpt ? { excerpt } : {}),
    })),
    ...(patch !== undefined ? { patch } : {}),
  };
}

/** An AG-UI `ResumeEntry` answering an interrupt with a review (`AgUiResumeEntry`, typed here). */
export interface DiffReviewResumeEntry {
  interruptId: string;
  status: 'resolved';
  payload: DiffReviewToolOutput;
}

/**
 * The review as the answer to an AG-UI interrupt: pass it to `useAgUiAgent`'s `resolve`, or put it
 * in `RunAgentInput.resume` yourself. The payload is `reviewToolOutput(result, options)`.
 */
export function reviewResumeEntry(
  interruptId: string,
  result: DiffReviewResult,
  options?: DiffReviewToolOutputOptions,
): DiffReviewResumeEntry {
  return { interruptId, status: 'resolved', payload: reviewToolOutput(result, options) };
}
