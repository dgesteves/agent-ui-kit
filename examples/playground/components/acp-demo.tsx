'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AgentMessage,
  AgentStatus,
  ApprovalCard,
  DiffReview,
  deriveAgentState,
  type ApprovalDecision,
} from 'signoff-ui';
import {
  acpToolName,
  answerAcpPermission,
  createAcpTurn,
  decisionsFromAcpOptions,
  endAcpTurn,
  fromAcpDiffs,
  reduceAcpTurn,
  requestAcpPermission,
  toAcpMessage,
  toAcpPermissionResponse,
  type AcpPermissionOption,
  type AcpRequestPermissionRequest,
  type AcpRequestPermissionResponse,
  type AcpSessionNotification,
  type AcpSessionUpdate,
  type AcpTurn,
} from 'signoff-ui/acp';

const PROMPT = 'The formatDuration test fails. Fix it.';
const ROOT = '/home/dev/app';
const SESSION = 'sess_demo';

/** What an ACP client implements for the agent: the methods `ClientSideConnection` calls. */
interface AcpClient {
  sessionUpdate(params: AcpSessionNotification): Promise<void>;
  requestPermission(params: AcpRequestPermissionRequest): Promise<AcpRequestPermissionResponse>;
}

const BEFORE = `export function formatDuration(ms: number): string {
  if (ms < 1000) return \`\${Math.round(ms)}ms\`;
  return \`\${(ms / 1000).toFixed(1)}s\`;
}
`;

const AFTER = `export function formatDuration(ms: number): string {
  if (ms < 1000) return \`\${Math.round(ms)}ms\`;
  // Truncate to tenths: 59,950 ms is 59.9s, not 60.0s.
  return \`\${(Math.floor(ms / 100) / 10).toFixed(1)}s\`;
}
`;

const ONCE_OR_ALWAYS: AcpPermissionOption[] = [
  { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
  { optionId: 'allow-always', name: 'Always allow', kind: 'allow_always' },
  { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
];

const text = (content: string) => ({ type: 'content' as const, content: { type: 'text', text: content } });

/**
 * A scripted ACP agent, no real one: it plays the session updates a coding agent sends for one
 * prompt turn, asks permission to edit a file and to run the tests, and returns the turn's
 * `stopReason`, with model-like pacing. An agent over stdio or WebSocket sends the same messages.
 */
async function runScriptedAgent(client: AcpClient, signal: AbortSignal): Promise<{ stopReason: string }> {
  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      });
    });
  const send = async (update: AcpSessionUpdate & Record<string, unknown>, ms = 220) => {
    await wait(ms);
    await client.sessionUpdate({ sessionId: SESSION, update });
  };
  const say = async (sessionUpdate: 'agent_message_chunk' | 'agent_thought_chunk', words: string) => {
    for (const piece of words.match(/\S+\s*/g) ?? [])
      await send({ sessionUpdate, content: { type: 'text', text: piece } }, 35);
  };
  const ask = async (toolCall: AcpRequestPermissionRequest['toolCall'], options: AcpPermissionOption[]) => {
    await wait(300);
    const { outcome } = await client.requestPermission({ sessionId: SESSION, toolCall, options });
    return (
      outcome.outcome === 'selected' && options.find((o) => o.optionId === outcome.optionId)?.kind.startsWith('allow')
    );
  };

  await say(
    'agent_thought_chunk',
    'The test expects 59,950 ms to read 59.9s and gets 60.0s, so the seconds are rounded where they should be cut.',
  );
  await say('agent_message_chunk', "I'll read the formatter first.");
  const file = `${ROOT}/lib/format.ts`;
  await send({
    sessionUpdate: 'tool_call',
    toolCallId: 'read-1',
    title: 'Read lib/format.ts',
    kind: 'read',
    status: 'in_progress',
    rawInput: { path: file },
    locations: [{ path: file }],
  });
  await send(
    { sessionUpdate: 'tool_call_update', toolCallId: 'read-1', status: 'completed', content: [text(BEFORE)] },
    650,
  );
  await say('agent_message_chunk', ' `toFixed(1)` rounds. Cutting to tenths first fixes it.');

  const edit = {
    toolCallId: 'edit-1',
    title: 'Edit lib/format.ts',
    kind: 'edit',
    status: 'pending' as const,
    rawInput: { path: file },
    content: [{ type: 'diff' as const, path: file, oldText: BEFORE, newText: AFTER }],
  };
  await send({ sessionUpdate: 'tool_call', ...edit });
  if (!(await ask(edit, ONCE_OR_ALWAYS))) {
    await send({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'edit-1',
      status: 'failed',
      content: [text('Rejected by the user')],
    });
    await say('agent_message_chunk', " I left lib/format.ts as it was. Tell me if you'd rather change the test.");
    return { stopReason: 'end_turn' };
  }
  await send({ sessionUpdate: 'tool_call_update', toolCallId: 'edit-1', status: 'completed' }, 400);
  await say('agent_message_chunk', ' Edited. Now the tests:');

  const command = 'pnpm test lib/format';
  const tests = {
    toolCallId: 'test-1',
    title: command,
    kind: 'execute',
    status: 'pending' as const,
    rawInput: { command },
  };
  await send({ sessionUpdate: 'tool_call', ...tests });
  if (!(await ask(tests, ONCE_OR_ALWAYS))) {
    await say('agent_message_chunk', ' Skipped the tests. Run `pnpm test lib/format` when you want to check it.');
    return { stopReason: 'end_turn' };
  }
  await send({ sessionUpdate: 'tool_call_update', toolCallId: 'test-1', status: 'in_progress' });
  await send(
    {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'test-1',
      status: 'completed',
      content: [text('Tests  14 passed (14)')],
    },
    900,
  );
  await say('agent_message_chunk', ' The test passes: 59,950 ms now reads **59.9s**.');
  return { stopReason: 'end_turn' };
}

/** The approval for a call the agent asked permission for: its diff, if it edits files, and the agent's options. */
function Permission({
  turn,
  toolCallId,
  onDecide,
}: {
  turn: AcpTurn;
  toolCallId: string;
  onDecide: (decision: ApprovalDecision) => void;
}) {
  const call = turn.toolCalls[toolCallId]!;
  const { options, decision } = turn.permissions[toolCallId]!;
  const files = fromAcpDiffs(call.content, { root: ROOT });
  return (
    <ApprovalCard
      toolName={acpToolName(call)}
      title={call.title ?? undefined}
      input={call.rawInput}
      risk={call.kind === 'execute' ? 'medium' : 'low'}
      headingLevel={3}
      preview={
        files.length > 0 ? <DiffReview files={files} readOnly title="Proposed edit" headingLevel={4} /> : undefined
      }
      status={decision === undefined ? 'pending' : decision.startsWith('allow') ? 'approved' : 'denied'}
      decision={decision === 'cancelled' ? undefined : decision}
      // ACP has no "this session" option: offer what the agent offered.
      // The agent keeps what "always" means: no argument patterns to show.
      ruleScope={false}
      decisions={decisionsFromAcpOptions(options).filter((d) => d !== 'allow-session')}
      onDecide={(choice) => onDecide(choice.decision)}
    />
  );
}

function Run({ onReset }: { onReset: () => void }) {
  const [turn, setTurn] = useState<AcpTurn>();
  const waiting = useRef(new Map<string, (response: AcpRequestPermissionResponse) => void>());
  const abort = useRef<AbortController>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const start = () => {
    const controller = new AbortController();
    abort.current = controller;
    setTurn(createAcpTurn());
    const client: AcpClient = {
      sessionUpdate: async (params) => setTurn((t) => t && reduceAcpTurn(t, params)),
      requestPermission: (params) =>
        new Promise((resolve) => {
          waiting.current.set(params.toolCall.toolCallId, resolve);
          setTurn((t) => t && requestAcpPermission(t, params));
        }),
    };
    runScriptedAgent(client, controller.signal).then(
      (result) => setTurn((t) => t && endAcpTurn(t, result)),
      () => {},
    );
  };

  const decide = (toolCallId: string, decision: ApprovalDecision) => {
    const options = turn?.permissions[toolCallId]?.options ?? [];
    setTurn((t) => t && answerAcpPermission(t, toolCallId, decision));
    waiting.current.get(toolCallId)?.(toAcpPermissionResponse(decision, options));
    waiting.current.delete(toolCallId);
  };

  const message = turn && toAcpMessage(turn);
  const { state, detail } = deriveAgentState({ status: turn?.status ?? 'ready', message });
  const finished = state === 'done' || state === 'stopped' || state === 'error';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {turn ? (
          <p className="bg-signoff-surface text-signoff-fg rounded-lg px-3 py-1.5 text-[13px]">{PROMPT}</p>
        ) : (
          <button
            type="button"
            onClick={start}
            className="bg-signoff-accent text-signoff-on-accent rounded-lg px-3 py-1.5 text-[13px] font-medium hover:opacity-90"
          >
            Run the ACP agent
          </button>
        )}
        <AgentStatus state={state} detail={detail} size="sm" />
        {turn && finished ? (
          <button
            type="button"
            onClick={onReset}
            className="border-signoff-border text-signoff-fg-muted hover:text-signoff-fg ml-auto rounded-lg border px-3 py-1.5 font-mono text-xs"
          >
            Reset
          </button>
        ) : null}
      </div>
      {turn && message ? (
        <AgentMessage
          message={message}
          streaming={turn.status === 'streaming'}
          active={!finished}
          renderTool={(part) =>
            turn.permissions[part.toolCallId] ? (
              <Permission turn={turn} toolCallId={part.toolCallId} onDecide={(d) => decide(part.toolCallId, d)} />
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}

export default function AcpDemo() {
  const [session, setSession] = useState(0);
  return <Run key={session} onReset={() => setSession((s) => s + 1)} />;
}
