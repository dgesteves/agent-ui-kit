/**
 * AG-UI to AI SDK message parts, so the components render any AG-UI agent (LangGraph, CrewAI,
 * Mastra, Pydantic AI...). The types below mirror the parts of AG-UI 1.0 that are read
 * here, structurally, so `@ag-ui/core` and `@ag-ui/client` objects fit without either being a
 * dependency.
 */
import type { ChatStatus, DynamicToolUIPart, UIMessage } from 'ai';
import { addUsage } from './usage';
import type { RunUsage } from './ai';

/** An AG-UI event. Only `type` is required here; the fields each event type carries are read as needed. */
export interface AgUiEvent {
  type: string;
}

export interface AgUiToolCall {
  id: string;
  function: { name: string; arguments: string };
}

/** Text, image, audio, video or document content (AG-UI `ContentPart`). */
export interface AgUiContentPart {
  type: string;
  text?: string;
  source?: { type: string; value: string; mimeType?: string };
}

/** Any AG-UI message: user, assistant, reasoning, tool, activity, system or developer. */
export interface AgUiMessage {
  id: string;
  role: string;
  content?: unknown;
  toolCalls?: readonly AgUiToolCall[];
  toolCallId?: string;
  error?: string;
  activityType?: string;
}

/** A pause for human input (AG-UI `Interrupt`). `toolCallId` binds it to a tool call to approve. */
export interface AgUiInterrupt {
  id: string;
  reason: string;
  message?: string;
  toolCallId?: string;
  responseSchema?: Record<string, unknown>;
}

/** An answer to an interrupt, sent in `RunAgentInput.resume` (AG-UI `ResumeEntry`). */
export interface AgUiResumeEntry {
  interruptId: string;
  status: 'resolved' | 'cancelled';
  payload?: unknown;
}

/** AG-UI `TokenUsage`. Totals include cached and reasoning tokens, as in the AI SDK. */
export interface AgUiTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
  cacheWriteInputTokens?: number;
}

/** A decision on a tool-call interrupt, as the tool part shows it. */
export interface AgUiApproval {
  /** The interrupt id, which is also the approval id `ToolApprovalCard` responds with. */
  id: string;
  /** Undefined while nobody has answered. */
  approved?: boolean | undefined;
  reason?: string | undefined;
  /** The interrupt's message, e.g. "Send email to a@b.com?". */
  requestReason?: string | undefined;
}

/** What the event stream says about runs, beyond the messages themselves. */
export interface AgUiRunState {
  /** `useChat`-style: `submitted` until content streams, `ready` once the run ends, `error` after `RUN_ERROR`. */
  status: ChatStatus;
  error?: { message: string; code?: string | undefined } | undefined;
  /** Token usage summed over the runs seen, for `RunMeter`. */
  usage?: RunUsage | undefined;
  /** The step in progress (`STEP_STARTED`), e.g. a LangGraph node. */
  step?: string | undefined;
  /** Interrupts the last run ended with. The next run must answer all of them. */
  interrupts: AgUiInterrupt[];
  /** Answers given so far to `interrupts`, by interrupt id. */
  answers: Record<string, AgUiResumeEntry>;
  /** Tool-call interrupts and their decisions, by tool call id. Kept across runs. */
  approvals: Record<string, AgUiApproval>;
  /** Text and reasoning messages, and tool calls, still streaming. */
  streaming: { messages: string[]; toolCalls: string[] };
}

export function createAgUiRun(interrupts: readonly AgUiInterrupt[] = []): AgUiRunState {
  return withInterrupts(
    { status: 'ready', interrupts: [], answers: {}, approvals: {}, streaming: { messages: [], toolCalls: [] } },
    interrupts,
  );
}

function withInterrupts(run: AgUiRunState, interrupts: readonly AgUiInterrupt[]): AgUiRunState {
  const approvals = { ...run.approvals };
  for (const interrupt of interrupts) {
    if (interrupt.toolCallId)
      approvals[interrupt.toolCallId] = { id: interrupt.id, requestReason: interrupt.message ?? undefined };
  }
  return { ...run, interrupts: [...interrupts], answers: {}, approvals };
}

/** Fields read from events, all optional so one shape covers every event type. */
interface EventFields {
  type: string;
  messageId?: string;
  toolCallId?: string;
  stepName?: string;
  message?: string;
  code?: string;
  usage?: readonly AgUiTokenUsage[];
  outcome?: { type: string; interrupts?: readonly AgUiInterrupt[] };
}

const add = (list: string[], id: string | undefined) => (id === undefined || list.includes(id) ? list : [...list, id]);
const remove = (list: string[], id: string | undefined) => (list.includes(id!) ? list.filter((x) => x !== id) : list);

/**
 * Fold one AG-UI event into the run state. Pure, so it fits `useReducer` or any store;
 * `useAgUiAgent` uses it with an `@ag-ui/client` agent.
 */
export function reduceAgUiRun(run: AgUiRunState, event: AgUiEvent): AgUiRunState {
  const e = event as EventFields;
  const { messages, toolCalls } = run.streaming;
  const streaming = (next: Partial<AgUiRunState['streaming']>): AgUiRunState => ({
    ...run,
    status: 'streaming',
    streaming: { messages, toolCalls, ...next },
  });
  switch (e.type) {
    case 'RUN_STARTED':
      return {
        ...run,
        status: 'submitted',
        error: undefined,
        step: undefined,
        interrupts: [],
        answers: {},
        streaming: { messages: [], toolCalls: [] },
      };
    case 'TEXT_MESSAGE_START':
    case 'TEXT_MESSAGE_CHUNK':
    case 'REASONING_START':
    case 'REASONING_MESSAGE_START':
    case 'REASONING_MESSAGE_CHUNK':
      return streaming({ messages: add(messages, e.messageId) });
    case 'TEXT_MESSAGE_END':
    case 'REASONING_MESSAGE_END':
    case 'REASONING_END':
      return { ...run, streaming: { messages: remove(messages, e.messageId), toolCalls } };
    case 'TOOL_CALL_START':
    case 'TOOL_CALL_CHUNK':
      return streaming({ toolCalls: add(toolCalls, e.toolCallId) });
    case 'TOOL_CALL_END':
    case 'TOOL_CALL_RESULT':
      return { ...run, streaming: { messages, toolCalls: remove(toolCalls, e.toolCallId) } };
    case 'TEXT_MESSAGE_CONTENT':
    case 'REASONING_MESSAGE_CONTENT':
    case 'TOOL_CALL_ARGS':
      return run.status === 'streaming' ? run : { ...run, status: 'streaming' };
    case 'STEP_STARTED':
      return { ...run, step: e.stepName };
    case 'STEP_FINISHED':
      return run.step === e.stepName ? { ...run, step: undefined } : run;
    case 'RUN_FINISHED': {
      const ended = endRun(run, e.usage);
      return e.outcome?.type === 'interrupt' ? withInterrupts(ended, e.outcome.interrupts ?? []) : ended;
    }
    case 'RUN_ERROR':
      return { ...endRun(run, e.usage), status: 'error', error: { message: e.message ?? 'Run failed', code: e.code } };
    default:
      return run;
  }
}

function endRun(run: AgUiRunState, usage: readonly AgUiTokenUsage[] | undefined): AgUiRunState {
  let total = run.usage;
  for (const entry of usage ?? []) total = addUsage(total, fromAgUiUsage(entry));
  return { ...run, status: 'ready', step: undefined, usage: total, streaming: { messages: [], toolCalls: [] } };
}

/** An AG-UI `TokenUsage` entry as AI SDK usage. */
export function fromAgUiUsage(usage: AgUiTokenUsage): RunUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    inputTokenDetails: { cacheReadTokens: usage.cachedInputTokens, cacheWriteTokens: usage.cacheWriteInputTokens },
    outputTokenDetails: { reasoningTokens: usage.reasoningTokens },
  };
}

/** A tool approval, as `ToolApprovalCard` and `AgentMessage`'s `onToolApproval` give it. */
export interface AgUiApprovalResponse {
  id: string;
  approved: boolean;
  reason?: string | undefined;
}

/**
 * Record an answer to an open interrupt. A tool approval becomes the conventional
 * `{ approved, reason? }` payload; pass a resume entry for other interrupts.
 */
export function answerAgUiInterrupt(run: AgUiRunState, answer: AgUiApprovalResponse | AgUiResumeEntry): AgUiRunState {
  const entry: AgUiResumeEntry =
    'interruptId' in answer
      ? answer
      : {
          interruptId: answer.id,
          status: 'resolved',
          payload: { approved: answer.approved, ...(answer.reason ? { reason: answer.reason } : {}) },
        };
  const interrupt = run.interrupts.find((i) => i.id === entry.interruptId);
  if (!interrupt) return run;
  const approvals = { ...run.approvals };
  const approval = interrupt.toolCallId ? approvals[interrupt.toolCallId] : undefined;
  if (interrupt.toolCallId && approval) {
    const payload = entry.payload as { approved?: unknown; reason?: unknown } | undefined;
    approvals[interrupt.toolCallId] = {
      ...approval,
      approved: entry.status === 'resolved' && payload?.approved === true,
      reason: typeof payload?.reason === 'string' ? payload.reason : undefined,
    };
  }
  return { ...run, answers: { ...run.answers, [entry.interruptId]: entry }, approvals };
}

/** The resume entries for the next run, once every open interrupt has an answer. */
export function getAgUiResume(run: AgUiRunState): AgUiResumeEntry[] | undefined {
  if (run.interrupts.length === 0) return undefined;
  const entries = run.interrupts.map((i) => run.answers[i.id]);
  return entries.every((e) => e !== undefined) ? entries : undefined;
}

type Part = UIMessage['parts'][number];

/**
 * AG-UI messages as AI SDK `UIMessage`s: each user message, then the assistant, reasoning, tool and
 * activity messages after it grouped into one assistant message, the way the AI SDK groups a
 * multi-step run. Tool calls become dynamic tool parts with their results; with the run state,
 * streaming flags and tool-call interrupts (as approvals) are applied too. Activity messages become
 * `data-${activityType}` parts. System and developer messages are left out.
 */
export function fromAgUiMessages(messages: readonly AgUiMessage[], run?: AgUiRunState): UIMessage[] {
  const out: UIMessage[] = [];
  const results = new Map<string, AgUiMessage>();
  for (const message of messages)
    if (message.role === 'tool' && message.toolCallId) results.set(message.toolCallId, message);
  const streaming = (id: string) => run?.streaming.messages.includes(id) === true;
  let group: UIMessage | undefined;
  const assistant = (id: string) => {
    if (!group) {
      group = { id, role: 'assistant', parts: [] };
      out.push(group);
    }
    return group.parts;
  };

  for (const message of messages) {
    switch (message.role) {
      case 'user':
        group = undefined;
        out.push({ id: message.id, role: 'user', parts: userParts(message.content) });
        break;
      case 'assistant': {
        const parts = assistant(message.id);
        const text = typeof message.content === 'string' ? message.content : '';
        if (text) parts.push({ type: 'text', text, state: streaming(message.id) ? 'streaming' : 'done' });
        for (const call of message.toolCalls ?? []) parts.push(toolPart(call, results.get(call.id), run));
        break;
      }
      case 'reasoning': {
        const text = typeof message.content === 'string' ? message.content : '';
        if (text)
          assistant(message.id).push({ type: 'reasoning', text, state: streaming(message.id) ? 'streaming' : 'done' });
        break;
      }
      case 'activity':
        assistant(message.id).push({
          type: `data-${message.activityType ?? 'activity'}`,
          id: message.id,
          data: message.content,
        } as Part);
        break;
    }
  }
  return out;
}

function userParts(content: unknown): Part[] {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  if (!Array.isArray(content)) return [];
  const parts: Part[] = [];
  for (const part of content as AgUiContentPart[]) {
    if (part.type === 'text' && part.text) parts.push({ type: 'text', text: part.text });
    else if (part.source && (part.source.type === 'url' || part.source.type === 'data')) {
      const mediaType =
        part.source.mimeType ?? (part.type === 'document' ? 'application/octet-stream' : `${part.type}/*`);
      const url = part.source.type === 'url' ? part.source.value : `data:${mediaType};base64,${part.source.value}`;
      parts.push({ type: 'file', mediaType, url });
    }
  }
  return parts;
}

function toolPart(call: AgUiToolCall, result: AgUiMessage | undefined, run: AgUiRunState | undefined): Part {
  const base = { type: 'dynamic-tool' as const, toolName: call.function.name, toolCallId: call.id };
  const approval = run?.approvals[call.id];
  const decided = approval && { id: approval.id, requestReason: approval.requestReason, reason: approval.reason };
  const streaming = run?.streaming.toolCalls.includes(call.id) === true && !result;
  const input = streaming ? parsePartialJson(call.function.arguments) : parseArguments(call.function.arguments);
  let part: DynamicToolUIPart;
  if (result?.error) {
    part = { ...base, state: 'output-error', input, errorText: result.error };
  } else if (result) {
    part = { ...base, state: 'output-available', input, output: parseOutput(result.content) };
  } else if (streaming) {
    return { ...base, state: 'input-streaming', input };
  } else if (!approval) {
    return { ...base, state: 'input-available', input };
  } else if (approval.approved === undefined) {
    return { ...base, state: 'approval-requested', input, approval: { ...decided!, reason: undefined } } as Part;
  } else if (approval.approved) {
    return { ...base, state: 'approval-responded', input, approval: { ...decided!, approved: true } } as Part;
  } else {
    return { ...base, state: 'output-denied', input, approval: { ...decided!, approved: false } } as Part;
  }
  // A call that ran after its approval keeps it, so the timeline can say who approved it.
  return approval?.approved ? ({ ...part, approval: { ...decided!, approved: true } } as Part) : part;
}

function parseArguments(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Tool results arrive as strings; JSON objects and arrays are parsed so the timeline can show them as data. */
function parseOutput(content: unknown): unknown {
  if (Array.isArray(content)) {
    const parts = content as AgUiContentPart[];
    return parts.every((p) => p.type === 'text') ? parseOutput(parts.map((p) => p.text ?? '').join('')) : content;
  }
  if (typeof content !== 'string' || !/^\s*[[{]/.test(content)) return content;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return content;
  }
}

/**
 * Parse JSON that may be cut off mid-stream, such as tool arguments as they arrive: open strings,
 * arrays and objects are closed, and a trailing key or partial literal is dropped.
 * `{"query": "stre` gives `{ query: 'stre' }`. Returns `undefined` when nothing parses.
 */
export function parsePartialJson(text: string): unknown {
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // Cut off: repair below.
  }
  let body = text;
  const { inString, escaped } = scan(body);
  if (inString) body = `${(escaped ? body.slice(0, -1) : body).replace(/\\u[0-9a-fA-F]{0,3}$/, '')}"`;
  for (;;) {
    try {
      return JSON.parse(body + scan(body).closers) as unknown;
    } catch {
      const trimmed = trimLast(body);
      if (trimmed === body) return undefined;
      body = trimmed;
    }
  }
}

function scan(text: string) {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return { inString, escaped, closers: stack.reverse().join('') };
}

/** Drop the last incomplete token: a comma, a key and its colon, a string, or a partial number or literal. */
function trimLast(body: string): string {
  const t = body.trimEnd();
  if (t.endsWith(',')) return t.slice(0, -1);
  if (t.endsWith(':')) return t.slice(0, -1).replace(/"(?:[^"\\]|\\.)*"\s*$/, '');
  if (t.endsWith('"')) return t.replace(/"(?:[^"\\]|\\.)*"$/, '');
  return t.replace(/[^\s,:[\]{}"]+$/, '');
}
