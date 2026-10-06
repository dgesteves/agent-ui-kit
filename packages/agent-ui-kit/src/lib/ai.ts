/**
 * Thin, dependency-free helpers over AI SDK v7 `UIMessage` parts.
 * Only types are imported from `ai`, so nothing from the SDK runtime ends up in the bundle.
 */
import type {
  ChatStatus,
  DynamicToolUIPart,
  LanguageModelUsage,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  TextUIPart,
  ToolUIPart,
  UIMessage,
  UITools,
} from 'ai';

export type { ChatStatus, UIMessage };

/** Any part of any `UIMessage`. */
export type AnyUIPart = UIMessage['parts'][number];
/** A static (`tool-${name}`) or dynamic tool part. */
export type ToolPart = ToolUIPart<UITools> | DynamicToolUIPart;
/** The AI SDK v7 tool part states. */
export type ToolState = ToolPart['state'];
export type SourcePart = SourceUrlUIPart | SourceDocumentUIPart;
export type { ReasoningUIPart, SourceDocumentUIPart, SourceUrlUIPart, TextUIPart };

/** Token usage, compatible with the AI SDK `LanguageModelUsage` shape. */
export type RunUsage = {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  totalTokens?: number | undefined;
  inputTokenDetails?: Partial<LanguageModelUsage['inputTokenDetails']> | undefined;
  outputTokenDetails?: Partial<LanguageModelUsage['outputTokenDetails']> | undefined;
};

export const TOOL_STATES = [
  'input-streaming',
  'input-available',
  'approval-requested',
  'approval-responded',
  'output-available',
  'output-error',
  'output-denied',
] as const satisfies readonly ToolState[];

export function isToolPart(part: { type: string }): part is ToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

export function isSourcePart(part: { type: string }): part is SourcePart {
  return part.type === 'source-url' || part.type === 'source-document';
}

/** Same semantics as the SDK's `getToolName`, without the runtime import. */
export function getToolPartName(part: ToolPart): string {
  return part.type === 'dynamic-tool' ? part.toolName : part.type.slice('tool-'.length);
}

/**
 * A UI-level phase derived from the SDK tool state. Several SDK states collapse
 * into one visual phase (e.g. an approved call that has not returned yet is "running").
 */
export type ToolPhase = 'streaming' | 'running' | 'awaiting-approval' | 'success' | 'error' | 'denied';

export function getToolPhase(
  part: Pick<ToolPart, 'state'> & { approval?: { approved?: boolean } | undefined; preliminary?: boolean | undefined },
): ToolPhase {
  switch (part.state) {
    case 'input-streaming':
      return 'streaming';
    case 'input-available':
      return 'running';
    case 'approval-requested':
      return 'awaiting-approval';
    case 'approval-responded':
      return part.approval?.approved ? 'running' : 'denied';
    case 'output-available':
      return part.preliminary ? 'running' : 'success';
    case 'output-error':
      return 'error';
    case 'output-denied':
      return 'denied';
  }
}

export const TOOL_PHASE_LABEL: Record<ToolPhase, string> = {
  streaming: 'Preparing',
  running: 'Running',
  'awaiting-approval': 'Needs approval',
  success: 'Done',
  error: 'Failed',
  denied: 'Denied',
};

export function isSettledPhase(phase: ToolPhase): boolean {
  return phase === 'success' || phase === 'error' || phase === 'denied';
}

export function getToolParts(parts: readonly AnyUIPart[]): ToolPart[] {
  return parts.filter(isToolPart);
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied';

/** The approval state of a tool part, or `undefined` for parts outside the approval flow. */
export function getApprovalStatus(part: ToolPart): ApprovalStatus | undefined {
  if (!part.approval) return undefined;
  if (part.state === 'approval-requested') return 'pending';
  if (part.state === 'output-denied') return 'denied';
  return part.approval.approved ? 'approved' : part.approval.approved === false ? 'denied' : 'pending';
}

export interface ToolTiming {
  /** First time the call was observed (input started streaming). */
  startedAt?: number | undefined;
  /** When execution began: input complete, or approval granted. */
  runningAt?: number | undefined;
  /** When the call settled (output, error or denial). */
  endedAt?: number | undefined;
}

export type ToolTimings = Readonly<Record<string, ToolTiming>>;

/** Pure reducer behind `useToolTimings`, exported for tests and custom stores. */
export function observeToolTimings(prev: ToolTimings, tools: readonly ToolPart[], now: number): ToolTimings {
  let next: Record<string, ToolTiming> | undefined;
  const write = (id: string, value: ToolTiming) => {
    next ??= { ...prev };
    next[id] = value;
  };
  for (const tool of tools) {
    const phase = getToolPhase(tool);
    const current = (next ?? prev)[tool.toolCallId];
    if (!current) {
      if (isSettledPhase(phase)) write(tool.toolCallId, {});
      else write(tool.toolCallId, { startedAt: now, runningAt: phase === 'running' ? now : undefined });
      continue;
    }
    if (current.startedAt === undefined || current.endedAt !== undefined) continue;
    if (phase === 'running' && current.runningAt === undefined) write(tool.toolCallId, { ...current, runningAt: now });
    else if (isSettledPhase(phase))
      write(tool.toolCallId, { ...current, runningAt: current.runningAt ?? now, endedAt: now });
  }
  return next ?? prev;
}

/** Collect sources, de-duplicated by URL (or source id for documents). */
export function getSourceParts(parts: readonly AnyUIPart[]): SourcePart[] {
  const seen = new Set<string>();
  const out: SourcePart[] = [];
  for (const part of parts) {
    if (!isSourcePart(part)) continue;
    const key = part.type === 'source-url' ? part.url : `doc:${part.sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/** A source in app-level shape. AI SDK `source-url` / `source-document` parts are accepted too. */
export interface SourceItem {
  id: string;
  url?: string | undefined;
  title?: string | undefined;
  /** Optional snippet shown in the cards variant. */
  description?: string | undefined;
  /** For documents. */
  filename?: string | undefined;
  mediaType?: string | undefined;
}

export function toSourceItem(source: SourcePart | SourceItem): SourceItem {
  if ('type' in source && isSourcePart(source as SourcePart)) {
    const part = source as SourcePart;
    return part.type === 'source-url'
      ? { id: part.sourceId, url: part.url, title: part.title }
      : { id: part.sourceId, title: part.title, filename: part.filename, mediaType: part.mediaType };
  }
  return source as SourceItem;
}

export type AgentState = 'idle' | 'thinking' | 'working' | 'awaiting-approval' | 'done' | 'error';

export const AGENT_STATE_LABEL: Record<AgentState, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  working: 'Working',
  'awaiting-approval': 'Waiting for approval',
  done: 'Done',
  error: 'Error',
};

export interface DerivedAgentState {
  state: AgentState;
  /** Short human detail, e.g. "read_file" or "Writing response". */
  detail?: string | undefined;
}

/**
 * Map `useChat` status plus the latest assistant message to a single agent state.
 * Human-in-the-loop waits (approvals, client-side tools awaiting output) take
 * precedence over transport status, because the run cannot progress without the user.
 */
export function deriveAgentState({
  status,
  message,
  pendingClientTools = [],
}: {
  status: ChatStatus;
  message?: Pick<UIMessage, 'role' | 'parts'> | undefined;
  /** Names of client-side tools whose `input-available` state means "waiting for the user". */
  pendingClientTools?: readonly string[];
}): DerivedAgentState {
  if (status === 'error') return { state: 'error' };
  const parts = message?.role === 'assistant' ? message.parts : [];
  const tools = getToolParts(parts);
  const approval = tools.find((t) => t.state === 'approval-requested');
  if (approval) return { state: 'awaiting-approval', detail: getToolPartName(approval) };
  const clientWait = tools.find(
    (t) => t.state === 'input-available' && pendingClientTools.includes(getToolPartName(t)),
  );
  if (clientWait && status !== 'submitted') return { state: 'awaiting-approval', detail: getToolPartName(clientWait) };
  if (status === 'submitted') return { state: 'thinking' };
  if (status === 'streaming') {
    const last = parts.at(-1);
    if (!last || last.type === 'step-start' || last.type === 'reasoning') return { state: 'thinking' };
    if (isToolPart(last)) return { state: 'working', detail: getToolPartName(last) };
    if (last.type === 'text') return { state: 'working', detail: 'Writing response' };
    return { state: 'working' };
  }
  return parts.length > 0 ? { state: 'done' } : { state: 'idle' };
}
