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

export type AgentState = 'idle' | 'thinking' | 'working' | 'awaiting-approval' | 'done' | 'error';

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
