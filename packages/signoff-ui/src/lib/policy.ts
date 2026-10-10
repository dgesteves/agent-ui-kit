/**
 * Approval rules: what a person decided once, applied to the calls that follow. Pure, with no React,
 * so the same rules decide on the client (answering a request before anyone is asked) and on the
 * server (`toToolApproval`, for AI SDK 7's `toolApproval`).
 */

/** What a person can decide about a tool call, and for how long it holds. */
export type ApprovalDecision = 'allow-once' | 'allow-session' | 'allow-always' | 'deny-once' | 'deny-always';

export const APPROVAL_DECISIONS: readonly ApprovalDecision[] = [
  'allow-once',
  'allow-session',
  'allow-always',
  'deny-once',
  'deny-always',
];

/** A standing decision about a tool's calls: allowed or denied, for the session or always. */
export interface ApprovalRule {
  /** Unique among the rules. */
  id: string;
  /** The tool's name, or a glob over names: `*` for every tool, `mcp_github_*` for a family. */
  tool: string;
  /**
   * Globs by argument name, which must all match: `{ command: 'npm test*' }`. A dotted name reads
   * a nested argument (`'options.cwd'`). Absent: any arguments.
   */
  args?: Readonly<Record<string, string>> | undefined;
  /** A test of your own on the input, on top of `args`. Code, so storage does not keep it. */
  when?: ((input: unknown) => boolean) | undefined;
  effect: 'allow' | 'deny';
  /** `session`: until the page reloads or the session is cleared. `always`: kept by the storage. */
  scope: 'session' | 'always';
  /** When it was made, in milliseconds since the epoch. */
  createdAt?: number | undefined;
  /** Why it was made, e.g. the reason a person gave when denying. */
  reason?: string | undefined;
}

/** A tool call that needs a decision. */
export interface ApprovalRequest {
  /**
   * The id a response answers: AI SDK's `approval.id`, an AG-UI interrupt's id, or for ACP the
   * tool call's id.
   */
  id: string;
  toolName: string;
  input: unknown;
  toolCallId?: string | undefined;
}

/** The rule that decides a call. */
export interface RuleMatch {
  effect: 'allow' | 'deny';
  rule: ApprovalRule;
}

/**
 * Characters a single `*` or `?` never matches: what chains, pipes, substitutes or redirects a
 * shell command. So `npm test*` allows `npm test -- --watch` but not `npm test && rm -rf ~`.
 */
const SHELL_CONTROL = ';&|`<>\r\n';

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/**
 * A glob as a regular expression over the whole value:
 * - `*` matches any run of characters but shell control characters (`;`, `&`, `|`, `` ` ``, `<`,
 *   `>`, line breaks) and `$(`;
 * - `?` matches one such character;
 * - `**` matches any run of characters at all;
 * - `\` makes the next character literal; everything else is literal.
 */
export function globToRegExp(pattern: string): RegExp {
  const safe = `(?:(?!\\$\\()[^${escapeRegExp(SHELL_CONTROL)}])`;
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;
    if (char === '\\' && i + 1 < pattern.length) {
      source += escapeRegExp(pattern[++i]!);
    } else if (char === '*' && pattern[i + 1] === '*') {
      source += '[\\s\\S]*';
      while (pattern[i + 1] === '*') i++;
    } else if (char === '*') {
      source += `${safe}*`;
    } else if (char === '?') {
      source += safe;
    } else {
      source += escapeRegExp(char);
    }
  }
  return new RegExp(`^${source}$`);
}

const compiled = new Map<string, RegExp>();

/** Whether a whole value matches a glob (see `globToRegExp`). */
export function matchesGlob(value: string, pattern: string): boolean {
  let regexp = compiled.get(pattern);
  if (!regexp) {
    regexp = globToRegExp(pattern);
    if (compiled.size > 500) compiled.clear();
    compiled.set(pattern, regexp);
  }
  return regexp.test(value);
}

/** An argument by name, dotted names reading nested objects: `'options.cwd'`. */
function argument(input: unknown, name: string): unknown {
  if (input === null || typeof input !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(input, name)) return (input as Record<string, unknown>)[name];
  let value: unknown = input;
  for (const key of name.split('.')) {
    if (value === null || typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key))
      return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** A string, number or boolean argument as text; anything else matches no pattern. */
function argumentText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  return undefined;
}

/** Whether a rule applies to a call: its tool, every argument pattern, and its own test. */
export function ruleMatches(rule: ApprovalRule, toolName: string, input: unknown): boolean {
  if (!matchesGlob(toolName, rule.tool)) return false;
  for (const [name, pattern] of Object.entries(rule.args ?? {})) {
    const text = argumentText(argument(input, name));
    if (text === undefined || !matchesGlob(text, pattern)) return false;
  }
  if (rule.when) {
    try {
      if (!rule.when(input)) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** How narrow a rule is, to report the most specific of several that match. */
const specificity = (rule: ApprovalRule) =>
  (rule.tool.includes('*') || rule.tool.includes('?') ? 0 : 100) +
  Object.keys(rule.args ?? {}).length * 10 +
  (rule.when ? 5 : 0);

/**
 * The rule that decides a call, if any. A deny rule wins over an allow rule, whatever their
 * order; among rules of the same effect the most specific is the one reported.
 */
export function evaluateRules(rules: readonly ApprovalRule[], toolName: string, input: unknown): RuleMatch | undefined {
  let best: ApprovalRule | undefined;
  for (const rule of rules) {
    if (!ruleMatches(rule, toolName, input)) continue;
    if (
      !best ||
      (rule.effect === 'deny' && best.effect === 'allow') ||
      (rule.effect === best.effect && specificity(rule) > specificity(best))
    )
      best = rule;
  }
  return best ? { effect: best.effect, rule: best } : undefined;
}

/** What a decision does now, and the rule it leaves, if any. */
export function decisionEffect(decision: ApprovalDecision): {
  approved: boolean;
  scope: 'once' | 'session' | 'always';
} {
  const approved = decision.startsWith('allow');
  const scope = decision.endsWith('session') ? 'session' : decision.endsWith('always') ? 'always' : 'once';
  return { approved, scope };
}

/** Program and subcommand words of a shell command, before the first option or operator. */
function commandPrefix(command: string) {
  const words: string[] = [];
  for (const word of command.trim().split(/\s+/)) {
    if (!word || word.startsWith('-') || /[;&|`<>$'"\\*?]/.test(word) || words.length === 2) break;
    words.push(word);
  }
  return words.join(' ');
}

/**
 * The argument patterns a rule made from this call would start with: for a shell command, its
 * program and subcommand (`npm test*`); otherwise each string, number and boolean argument as it
 * is (globs escaped). The person can widen them before saving.
 */
export function suggestArgs(input: unknown): Record<string, string> | undefined {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (typeof record.command === 'string') {
    const prefix = commandPrefix(record.command);
    return prefix ? { command: `${prefix.replace(/[\\*?]/g, '\\$&')}*` } : undefined;
  }
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(record)) {
    const text = argumentText(value);
    if (text !== undefined) out[name] = text.replace(/[\\*?]/g, '\\$&');
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

let ruleIds = 0;

/**
 * The rule a decision leaves: none for `allow-once` and `deny-once`. `args` narrows it to some
 * arguments; without it, it covers every call of the tool.
 */
export function ruleFromDecision(
  decision: ApprovalDecision,
  request: Pick<ApprovalRequest, 'toolName'>,
  {
    args,
    reason,
    id,
    now,
  }: { args?: Record<string, string> | undefined; reason?: string; id?: string; now?: number } = {},
): ApprovalRule | undefined {
  const { approved, scope } = decisionEffect(decision);
  if (scope === 'once') return undefined;
  return {
    id: id ?? `rule-${Date.now().toString(36)}-${++ruleIds}`,
    tool: request.toolName.replace(/[\\*?]/g, '\\$&'),
    ...(args && Object.keys(args).length > 0 ? { args: { ...args } } : {}),
    effect: approved ? 'allow' : 'deny',
    scope: scope === 'session' ? 'session' : 'always',
    createdAt: now ?? Date.now(),
    ...(reason ? { reason } : {}),
  };
}

/** A rule in words: "run_command with command npm test*". */
export function describeRule(rule: Pick<ApprovalRule, 'tool' | 'args'>): string {
  const args = Object.entries(rule.args ?? {});
  const tool = rule.tool === '*' ? 'any tool' : rule.tool.replace(/\\(.)/g, '$1');
  return args.length === 0 ? `${tool}, any arguments` : `${tool} with ${args.map(([k, v]) => `${k} ${v}`).join(', ')}`;
}

/* AI SDK 7: the same rules on the server, for `streamText({ toolApproval })`. */

/** AI SDK 7's `ToolApprovalStatus`, as `toToolApproval` returns it. */
export type ToolApprovalStatusLike =
  | 'not-applicable'
  | 'approved'
  | 'denied'
  | 'user-approval'
  | { type: 'approved' | 'denied' | 'user-approval'; reason?: string };

/**
 * Rules as AI SDK 7's generic `toolApproval` function: a matching rule approves or denies the call
 * on the server, with the rule in the reason, and any other call gets `otherwise` (by default
 * `'user-approval'`, a person decides). The SDK checks it again on the approved call before it
 * runs, edited arguments included.
 *
 * Rules a client sends are the choices of the person using it: take them for that person's own
 * runs only, and keep rules that protect others on the server.
 */
export function toToolApproval(
  rules: readonly ApprovalRule[] | (() => readonly ApprovalRule[]),
  { otherwise = 'user-approval' }: { otherwise?: ToolApprovalStatusLike } = {},
): (options: { toolCall: { toolName: string; input: unknown } }) => ToolApprovalStatusLike {
  return ({ toolCall }) => {
    const match = evaluateRules(typeof rules === 'function' ? rules() : rules, toolCall.toolName, toolCall.input);
    if (!match) return otherwise;
    const reason = `${match.effect === 'allow' ? 'Allowed' : 'Denied'} by a rule: ${describeRule(match.rule)}${
      match.rule.reason ? ` (${match.rule.reason})` : ''
    }`;
    return { type: match.effect === 'allow' ? 'approved' : 'denied', reason };
  };
}

/** A decision as the response `addToolApprovalResponse` (from `useChat`) takes. */
export function toToolApprovalResponse(
  id: string,
  decision: ApprovalDecision,
  reason?: string,
): { id: string; approved: boolean; reason?: string } {
  const { approved } = decisionEffect(decision);
  return reason ? { id, approved, reason } : { id, approved };
}

/**
 * Messages with one tool call's input replaced, for approving edited arguments with AI SDK 7: set
 * them with `setMessages` (from `useChat`), then answer the approval. The server runs the call with the
 * input in the messages, after checking it against the tool's schema and `toolApproval` again.
 * With `experimental_toolApprovalSecret` set, the server signs the input it asked about and refuses
 * any other, so edits fail there by design.
 */
export function setToolInput<M extends { parts: readonly unknown[] }>(
  messages: readonly M[],
  toolCallId: string,
  input: unknown,
): M[] {
  return messages.map((message) => {
    const index = message.parts.findIndex(
      (part) =>
        typeof part === 'object' &&
        part !== null &&
        (part as { toolCallId?: unknown }).toolCallId === toolCallId &&
        'input' in part,
    );
    if (index === -1) return message;
    const parts = [...message.parts];
    parts[index] = { ...(parts[index] as object), input };
    return { ...message, parts };
  });
}

/* Agent Client Protocol: `session/request_permission`, typed here so nothing new is installed. */

/** ACP `PermissionOptionKind`. */
export type AcpPermissionOptionKind = 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';

/** ACP `PermissionOption`: a choice the agent offers. */
export interface AcpPermissionOption {
  optionId: string;
  name: string;
  kind: AcpPermissionOptionKind;
}

/** What `toAcpPermissionResponse` reads of ACP's `RequestPermissionRequest`. */
export interface AcpRequestPermissionRequest {
  sessionId: string;
  toolCall: {
    toolCallId: string;
    title?: string | null | undefined;
    kind?: string | null | undefined;
    rawInput?: unknown;
  };
  options: readonly AcpPermissionOption[];
}

/** ACP `RequestPermissionResponse`. */
export interface AcpRequestPermissionResponse {
  outcome: { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string };
}

const ACP_KIND: Record<AcpPermissionOptionKind, ApprovalDecision> = {
  allow_once: 'allow-once',
  allow_always: 'allow-always',
  reject_once: 'deny-once',
  reject_always: 'deny-always',
};

/** An ACP permission request as the card's request: the tool call's id, kind or title, and raw input. */
export function fromAcpPermissionRequest(request: AcpRequestPermissionRequest): ApprovalRequest & { title?: string } {
  const { toolCall } = request;
  return {
    id: toolCall.toolCallId,
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.kind ?? toolCall.title ?? 'tool',
    input: toolCall.rawInput,
    ...(toolCall.title ? { title: toolCall.title } : {}),
  };
}

/**
 * The decisions to offer for an ACP request: one per option the agent sent, plus
 * `allow-session`, which the client keeps as a rule of its own (ACP has no session option).
 */
export function decisionsFromAcpOptions(options: readonly AcpPermissionOption[]): ApprovalDecision[] {
  const offered = new Set(options.map((option) => ACP_KIND[option.kind]).filter(Boolean));
  if (offered.has('allow-once')) offered.add('allow-session');
  return APPROVAL_DECISIONS.filter((d) => offered.has(d));
}

/**
 * A decision as ACP's response: the option of the same kind. `allow-session` selects
 * `allow_once`: the session rule stays on the client, so it never grants more than the agent's
 * "once". Without a matching option the request is cancelled, as ACP asks of a client that can't answer.
 */
export function toAcpPermissionResponse(
  decision: ApprovalDecision,
  options: readonly AcpPermissionOption[],
): AcpRequestPermissionResponse {
  const want = decision === 'allow-session' ? 'allow-once' : decision;
  const option = options.find((o) => ACP_KIND[o.kind] === want);
  return option
    ? { outcome: { outcome: 'selected', optionId: option.optionId } }
    : { outcome: { outcome: 'cancelled' } };
}

/** An ACP response as the decision it records, or `cancelled`. */
export function fromAcpPermissionResponse(
  response: AcpRequestPermissionResponse,
  options: readonly AcpPermissionOption[],
): ApprovalDecision | 'cancelled' {
  if (response.outcome.outcome === 'cancelled') return 'cancelled';
  const { optionId } = response.outcome;
  const option = options.find((o) => o.optionId === optionId);
  return option ? ACP_KIND[option.kind] : 'cancelled';
}
