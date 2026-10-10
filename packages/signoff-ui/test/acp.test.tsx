import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  answerAcpPermission,
  createAcpTurn,
  decisionsFromAcpOptions,
  endAcpTurn,
  fromAcpDiffs,
  reduceAcpTurn,
  requestAcpPermission,
  toAcpDiffs,
  toAcpMessage,
  toAcpPermissionResponse,
  type AcpPermissionOption,
  type AcpSessionUpdate,
  type AcpTurn,
} from '../src/acp';
import { AgentMessage } from '../src/agent-message';
import { ToolApprovalCard } from '../src/approval-card';
import { deriveAgentState, type ToolPart } from '../src/lib/ai';

/*
 * signoff-ui/acp: an Agent Client Protocol prompt turn (`session/update` notifications and
 * `session/request_permission` requests) as the message parts the components render.
 */

const play = (...updates: (AcpSessionUpdate & Record<string, unknown>)[]) =>
  updates.reduce<AcpTurn>((turn, update) => reduceAcpTurn(turn, { sessionId: 's1', update }), createAcpTurn());

const chunk = (sessionUpdate: string, text: string) => ({ sessionUpdate, content: { type: 'text', text } });

const options: AcpPermissionOption[] = [
  { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
  { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
  { optionId: 'no', name: 'Reject', kind: 'reject_once' },
];

const edit = {
  toolCallId: 'edit-1',
  title: 'Edit lib/format.ts',
  kind: 'edit',
  status: 'pending' as const,
  rawInput: { path: '/repo/lib/format.ts' },
  content: [
    {
      type: 'diff' as const,
      path: '/repo/lib/format.ts',
      oldText: 'export const s = (ms) => ms / 1000;\n',
      newText: 'export const s = (ms) => Math.floor(ms / 100) / 10;\n',
    },
  ],
};

describe('reduceAcpTurn', () => {
  it('streams message and thought chunks into text and reasoning, in the order they arrive', () => {
    const turn = play(
      chunk('agent_thought_chunk', 'The test '),
      chunk('agent_thought_chunk', 'rounds up.'),
      chunk('agent_message_chunk', "I'll read "),
      chunk('agent_message_chunk', 'the formatter.'),
    );
    expect(turn.status).toBe('streaming');
    expect(turn.items).toEqual([
      { type: 'reasoning', text: 'The test rounds up.' },
      { type: 'text', text: "I'll read the formatter." },
    ]);
    expect(toAcpMessage(turn).parts).toEqual([
      { type: 'reasoning', text: 'The test rounds up.', state: 'done' },
      { type: 'text', text: "I'll read the formatter.", state: 'streaming' },
    ]);
  });

  it('takes the notification or its update, and leaves out what is not part of the reply', () => {
    const start = createAcpTurn();
    expect(start.status).toBe('submitted');
    const update = chunk('agent_message_chunk', 'Hi');
    expect(reduceAcpTurn(start, update)).toEqual(reduceAcpTurn(start, { sessionId: 's1', update }));
    for (const ignored of [
      chunk('user_message_chunk', 'Fix the test'),
      { sessionUpdate: 'plan', entries: [] },
      { sessionUpdate: 'available_commands_update', availableCommands: [] },
      { sessionUpdate: 'tool_call' },
    ])
      expect(reduceAcpTurn(start, ignored)).toBe(start);
    // An image says the agent is replying, but adds no text.
    expect(
      reduceAcpTurn(start, { sessionUpdate: 'agent_message_chunk', content: { type: 'image' } } as AcpSessionUpdate),
    ).toMatchObject({ status: 'streaming', items: [] });
  });

  it('merges tool call updates by id: content replaced, null and missing fields kept', () => {
    const turn = play(
      { sessionUpdate: 'tool_call', toolCallId: 'r1', title: 'Read lib/format.ts', kind: 'read', status: 'pending' },
      { sessionUpdate: 'tool_call_update', toolCallId: 'r1', status: 'in_progress', title: null },
      {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'r1',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: 'export const s = …' } }],
      },
      // An update for a call never announced is taken as the call.
      { sessionUpdate: 'tool_call_update', toolCallId: 'x1', kind: 'search', status: 'in_progress' },
    );
    expect(turn.items).toEqual([
      { type: 'tool', toolCallId: 'r1' },
      { type: 'tool', toolCallId: 'x1' },
    ]);
    expect(turn.toolCalls.r1).toMatchObject({ title: 'Read lib/format.ts', kind: 'read', status: 'completed' });
    expect(toAcpMessage(turn).parts).toEqual([
      {
        type: 'dynamic-tool',
        toolName: 'read',
        toolCallId: 'r1',
        title: 'Read lib/format.ts',
        input: {},
        state: 'output-available',
        output: 'export const s = …',
      },
      { type: 'dynamic-tool', toolName: 'search', toolCallId: 'x1', input: {}, state: 'input-available' },
    ]);
  });

  it('names a tool by its name, else its kind, else its title, and reports a failure with its text', () => {
    const turn = play(
      { sessionUpdate: 'tool_call', toolCallId: 'a', title: 'Run tests', name: 'Bash', kind: 'execute' },
      { sessionUpdate: 'tool_call', toolCallId: 'b', title: 'Think it over' },
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'c',
        kind: 'execute',
        status: 'failed',
        content: [{ type: 'content', content: { type: 'text', text: 'exit code 1' } }],
      },
      { sessionUpdate: 'tool_call', toolCallId: 'd', kind: 'fetch', status: 'completed', rawOutput: { status: 200 } },
      { sessionUpdate: 'tool_call', toolCallId: 'e', kind: 'execute', status: 'failed' },
    );
    const parts = toAcpMessage(turn).parts as ToolPart[];
    expect(parts.map((p) => (p.type === 'dynamic-tool' ? p.toolName : ''))).toEqual([
      'Bash',
      'Think it over',
      'execute',
      'fetch',
      'execute',
    ]);
    expect(parts[2]).toMatchObject({ state: 'output-error', errorText: 'exit code 1' });
    expect(parts[3]).toMatchObject({ state: 'output-available', output: { status: 200 } });
    expect(parts[4]).toMatchObject({ state: 'output-error', errorText: 'Failed' });
  });
});

describe('permission requests', () => {
  const asked = () =>
    requestAcpPermission(play(chunk('agent_message_chunk', 'Fixing it.')), {
      sessionId: 's1',
      toolCall: edit,
      options,
    });

  it('waits on a person: an approval request whose id is the tool call id', () => {
    const turn = asked();
    expect(turn.permissions['edit-1']).toEqual({ options });
    const message = toAcpMessage(turn);
    expect(message.parts[1]).toMatchObject({
      type: 'dynamic-tool',
      toolName: 'edit',
      title: 'Edit lib/format.ts',
      state: 'approval-requested',
      approval: { id: 'edit-1' },
      input: { path: '/repo/lib/format.ts' },
    });
    expect(deriveAgentState({ status: 'streaming', message }).state).toBe('awaiting-approval');
  });

  it('records the decision, and keeps the approval once the call has run', () => {
    let turn = answerAcpPermission(asked(), 'edit-1', 'allow-always');
    expect(turn.permissions['edit-1']!.decision).toBe('allow-always');
    expect(toAcpMessage(turn).parts[1]).toMatchObject({
      state: 'approval-responded',
      approval: { id: 'edit-1', approved: true },
    });
    turn = reduceAcpTurn(turn, {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'edit-1',
      status: 'completed',
    } as AcpSessionUpdate);
    expect(toAcpMessage(turn).parts[1]).toMatchObject({
      state: 'output-available',
      output: null,
      approval: { id: 'edit-1', approved: true },
    });
  });

  it('shows a denial, and a cancelled request as denied', () => {
    expect(toAcpMessage(answerAcpPermission(asked(), 'edit-1', 'deny-once')).parts[1]).toMatchObject({
      state: 'output-denied',
      approval: { id: 'edit-1', approved: false },
    });
    expect(toAcpMessage(answerAcpPermission(asked(), 'edit-1', 'cancelled')).parts[1]).toMatchObject({
      state: 'output-denied',
      approval: { id: 'edit-1', approved: false, reason: 'Cancelled' },
    });
    // The agent then reports the call failed: it still reads as the person's no.
    const failed = reduceAcpTurn(answerAcpPermission(asked(), 'edit-1', 'deny-once'), {
      sessionUpdate: 'tool_call_update',
      toolCallId: 'edit-1',
      status: 'failed',
    } as AcpSessionUpdate);
    expect(toAcpMessage(failed).parts[1]).toMatchObject({ state: 'output-denied' });
    const turn = asked();
    expect(answerAcpPermission(turn, 'unknown', 'allow-once')).toBe(turn);
  });

  it('goes through the kit: the card offers the agent options, and its decision is the response', () => {
    const turn = asked();
    const part = toAcpMessage(turn).parts[1] as ToolPart;
    render(<ToolApprovalCard part={part} onRespond={() => {}} decisions={decisionsFromAcpOptions(options)} />);
    expect(screen.getByRole('group', { name: /Edit lib\/format\.ts/ })).toHaveAttribute('data-status', 'pending');
    expect(screen.getByRole('button', { name: 'Always' })).toBeInTheDocument();
    expect(toAcpPermissionResponse('allow-always', turn.permissions['edit-1']!.options)).toEqual({
      outcome: { outcome: 'selected', optionId: 'always' },
    });
  });
});

describe('the end of a turn', () => {
  it('is ready with its stop reason, or failed with the error', () => {
    const turn = play(chunk('agent_message_chunk', 'Done.'));
    const ended = endAcpTurn(turn, { stopReason: 'end_turn' });
    expect(ended).toMatchObject({ status: 'ready', stopReason: 'end_turn' });
    expect(toAcpMessage(ended).parts).toEqual([{ type: 'text', text: 'Done.', state: 'done' }]);
    expect(endAcpTurn(turn, { error: { message: 'Internal error' } })).toMatchObject({
      status: 'error',
      error: { message: 'Internal error' },
    });
  });

  it('renders in AgentMessage, with a call left running read as stopped once the turn is cancelled', () => {
    const turn = endAcpTurn(
      play(chunk('agent_message_chunk', 'Running the tests.'), {
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'pnpm test',
        kind: 'execute',
        status: 'in_progress',
      }),
      { stopReason: 'cancelled' },
    );
    const message = toAcpMessage(turn, 'm1');
    expect(message).toMatchObject({ id: 'm1', role: 'assistant' });
    expect(deriveAgentState({ status: turn.status, message }).state).toBe('stopped');
    render(<AgentMessage message={message} active={false} />);
    expect(screen.getByText('Running the tests.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pnpm test/ })).toHaveTextContent(/Stopped/);
  });
});

describe('diff content', () => {
  it('becomes DiffReview files, relative to the session root, new files with no old text', () => {
    const content = [
      ...edit.content,
      { type: 'diff' as const, path: '/repo/lib/new.ts', newText: 'export {};\n' },
      { type: 'diff' as const, path: '/elsewhere/a.ts', oldText: null, newText: 'a\n' },
      { type: 'content' as const, content: { type: 'text', text: 'not a file' } },
      { type: 'terminal' as const, terminalId: 'term-1' },
    ];
    expect(fromAcpDiffs(content, { root: '/repo/' })).toEqual([
      { path: 'lib/format.ts', oldContent: edit.content[0]!.oldText, newContent: edit.content[0]!.newText },
      { path: 'lib/new.ts', oldContent: '', newContent: 'export {};\n' },
      { path: '/elsewhere/a.ts', oldContent: '', newContent: 'a\n' },
    ]);
    expect(fromAcpDiffs(content).map((f) => f.path)).toEqual([
      '/repo/lib/format.ts',
      '/repo/lib/new.ts',
      '/elsewhere/a.ts',
    ]);
    expect(fromAcpDiffs(undefined)).toEqual([]);
  });

  it('comes back from files, round trip', () => {
    const files = fromAcpDiffs(edit.content, { root: '/repo' });
    expect(toAcpDiffs(files, { root: '/repo' })).toEqual(edit.content);
    expect(
      toAcpDiffs([
        { path: '/abs/new.ts', newContent: 'x\n' },
        { path: 'gone.ts', oldContent: 'y\n' },
      ]),
    ).toEqual([
      { type: 'diff', path: '/abs/new.ts', newText: 'x\n' },
      { type: 'diff', path: 'gone.ts', oldText: 'y\n', newText: '' },
    ]);
  });
});
