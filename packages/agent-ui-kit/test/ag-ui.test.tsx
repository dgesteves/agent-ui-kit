import { AbstractAgent, HttpAgent, type BaseEvent, type RunAgentInput } from '@ag-ui/client';
import { EventType, type Event as AgUiCoreEvent, type Message } from '@ag-ui/core';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Observable } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  answerAgUiInterrupt,
  createAgUiRun,
  fromAgUiMessages,
  getAgUiResume,
  parsePartialJson,
  reduceAgUiRun,
  useAgUiAgent,
  type AgUiAgentLike,
  type AgUiRunState,
} from '../src/ag-ui';
import { AgentMessage } from '../src/agent-message';
import { deriveAgentState } from '../src/lib/ai';

const fold = (events: readonly AgUiCoreEvent[], run: AgUiRunState = createAgUiRun()) =>
  events.reduce(reduceAgUiRun, run);

describe('parsePartialJson', () => {
  it.each([
    ['{"query": "stre', { query: 'stre' }],
    ['{"query": "streaming", "limit": 1', { query: 'streaming', limit: 1 }],
    ['{"query": "a", "lim', { query: 'a' }],
    ['{"query": "a", "limit":', { query: 'a' }],
    ['{"query": "a",', { query: 'a' }],
    ['{"flag": tr', {}],
    ['{"n": -', {}],
    ['{"paths": ["a.ts", "b', { paths: ['a.ts', 'b'] }],
    ['{"nested": {"deep": [1, {"x": "y\\', { nested: { deep: [1, { x: 'y' }] } }],
    ['{"text": "caf\\u00', { text: 'caf' }],
    ['{"done": true}', { done: true }],
    ['[', []],
  ])('%s', (text, expected) => {
    expect(parsePartialJson(text)).toEqual(expected);
  });

  it('returns undefined for nothing or garbage', () => {
    expect(parsePartialJson('')).toBeUndefined();
    expect(parsePartialJson('not json')).toBeUndefined();
  });
});

describe('reduceAgUiRun', () => {
  const started: AgUiCoreEvent = { type: EventType.RUN_STARTED, threadId: 't', runId: 'r1' };

  it('tracks status, streaming messages and tool calls, and the step', () => {
    let run = fold([started, { type: EventType.STEP_STARTED, stepName: 'planner' }]);
    expect(run).toMatchObject({ status: 'submitted', step: 'planner' });
    run = fold(
      [
        { type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant' },
        { type: EventType.TOOL_CALL_START, toolCallId: 'tc1', toolCallName: 'search', parentMessageId: 'm1' },
      ],
      run,
    );
    expect(run).toMatchObject({ status: 'streaming', streaming: { messages: ['m1'], toolCalls: ['tc1'] } });
    run = fold(
      [
        { type: EventType.TEXT_MESSAGE_END, messageId: 'm1' },
        { type: EventType.TOOL_CALL_END, toolCallId: 'tc1' },
        { type: EventType.STEP_FINISHED, stepName: 'planner' },
      ],
      run,
    );
    expect(run).toMatchObject({ status: 'streaming', step: undefined, streaming: { messages: [], toolCalls: [] } });
  });

  it('sums token usage over runs, mapping cache and reasoning counts', () => {
    const finished = (runId: string): AgUiCoreEvent => ({
      type: EventType.RUN_FINISHED,
      threadId: 't',
      runId,
      outcome: { type: 'success' },
      usage: [
        { model: 'a', inputTokens: 100, outputTokens: 20, totalTokens: 120, cachedInputTokens: 40, reasoningTokens: 5 },
        { model: 'b', inputTokens: 10, outputTokens: 2, totalTokens: 12, cacheWriteInputTokens: 10 },
      ],
    });
    const run = fold([started, finished('r1'), { ...started, runId: 'r2' }, finished('r2')]);
    expect(run.status).toBe('ready');
    expect(run.usage).toMatchObject({
      inputTokens: 220,
      outputTokens: 44,
      totalTokens: 264,
      inputTokenDetails: { cacheReadTokens: 80, cacheWriteTokens: 20 },
      outputTokenDetails: { reasoningTokens: 10 },
    });
  });

  it('turns RUN_ERROR into an error status, and clears it on the next run', () => {
    let run = fold([started, { type: EventType.RUN_ERROR, message: 'Rate limited', code: '429' }]);
    expect(run).toMatchObject({ status: 'error', error: { message: 'Rate limited', code: '429' } });
    run = fold([started], run);
    expect(run).toMatchObject({ status: 'submitted', error: undefined });
  });

  it('keeps the interrupts a run ends with, and resumes only once every one is answered', () => {
    let run = fold([
      started,
      {
        type: EventType.RUN_FINISHED,
        threadId: 't',
        runId: 'r1',
        outcome: {
          type: 'interrupt',
          interrupts: [
            { id: 'int1', reason: 'tool_call', toolCallId: 'tc1', message: 'Delete the branch?' },
            { id: 'int2', reason: 'input_required', message: 'Which environment?' },
          ],
        },
      },
    ]);
    expect(run.interrupts.map((i) => i.id)).toEqual(['int1', 'int2']);
    expect(run.approvals).toEqual({ tc1: { id: 'int1', requestReason: 'Delete the branch?' } });

    run = answerAgUiInterrupt(run, { id: 'int1', approved: false, reason: 'Not yet' });
    expect(run.approvals.tc1).toMatchObject({ approved: false, reason: 'Not yet' });
    expect(getAgUiResume(run)).toBeUndefined();

    run = answerAgUiInterrupt(run, { interruptId: 'int2', status: 'resolved', payload: { environment: 'staging' } });
    expect(getAgUiResume(run)).toEqual([
      { interruptId: 'int1', status: 'resolved', payload: { approved: false, reason: 'Not yet' } },
      { interruptId: 'int2', status: 'resolved', payload: { environment: 'staging' } },
    ]);
    // Answers for interrupts that aren't open are ignored.
    expect(answerAgUiInterrupt(run, { id: 'nope', approved: true })).toBe(run);
  });
});

describe('fromAgUiMessages', () => {
  const call = (id: string, name: string, args: string) => ({
    id,
    type: 'function' as const,
    function: { name, arguments: args },
  });
  const history: Message[] = [
    { id: 'sys', role: 'system', content: 'You are helpful.' },
    {
      id: 'u1',
      role: 'user',
      content: [
        { type: 'text', text: 'What is in this screenshot?' },
        { type: 'image', source: { type: 'url', value: 'https://example.com/a.png', mimeType: 'image/png' } },
        { type: 'document', source: { type: 'data', value: 'aGk=', mimeType: 'text/plain' } },
      ],
    },
    { id: 'r1', role: 'reasoning', content: 'Look up the docs first.' },
    {
      id: 'a1',
      role: 'assistant',
      content: 'Searching.',
      toolCalls: [call('tc1', 'search_docs', '{"query":"streaming"}'), call('tc2', 'read_file', '{"path":"a.ts"}')],
    },
    { id: 't1', role: 'tool', toolCallId: 'tc1', content: '{"hits":3}' },
    { id: 't2', role: 'tool', toolCallId: 'tc2', content: '', error: 'ENOENT' },
    { id: 'act', role: 'activity', activityType: 'plan', content: { steps: ['search', 'answer'] } },
    { id: 'a2', role: 'assistant', content: 'Found it.' },
    { id: 'u2', role: 'user', content: 'Thanks' },
  ];

  it('groups each turn into one assistant message, with tool results on their calls', () => {
    expect(fromAgUiMessages(history)).toEqual([
      {
        id: 'u1',
        role: 'user',
        parts: [
          { type: 'text', text: 'What is in this screenshot?' },
          { type: 'file', mediaType: 'image/png', url: 'https://example.com/a.png' },
          { type: 'file', mediaType: 'text/plain', url: 'data:text/plain;base64,aGk=' },
        ],
      },
      {
        id: 'r1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'Look up the docs first.', state: 'done' },
          { type: 'text', text: 'Searching.', state: 'done' },
          {
            type: 'dynamic-tool',
            toolName: 'search_docs',
            toolCallId: 'tc1',
            state: 'output-available',
            input: { query: 'streaming' },
            output: { hits: 3 },
          },
          {
            type: 'dynamic-tool',
            toolName: 'read_file',
            toolCallId: 'tc2',
            state: 'output-error',
            input: { path: 'a.ts' },
            errorText: 'ENOENT',
          },
          { type: 'data-plan', id: 'act', data: { steps: ['search', 'answer'] } },
          { type: 'text', text: 'Found it.', state: 'done' },
        ],
      },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Thanks' }] },
    ]);
  });

  it('applies the run state: streaming text and arguments, and approvals', () => {
    const messages: Message[] = [
      { id: 'a1', role: 'assistant', content: 'Let me', toolCalls: [call('tc1', 'run_command', '{"command":"pnpm')] },
    ];
    let run = fold([
      { type: EventType.RUN_STARTED, threadId: 't', runId: 'r1' },
      { type: EventType.TEXT_MESSAGE_START, messageId: 'a1', role: 'assistant' },
      { type: EventType.TOOL_CALL_START, toolCallId: 'tc1', toolCallName: 'run_command', parentMessageId: 'a1' },
    ]);
    expect(fromAgUiMessages(messages, run)[0]!.parts).toEqual([
      { type: 'text', text: 'Let me', state: 'streaming' },
      {
        type: 'dynamic-tool',
        toolName: 'run_command',
        toolCallId: 'tc1',
        state: 'input-streaming',
        input: { command: 'pnpm' },
      },
    ]);

    messages[0] = {
      id: 'a1',
      role: 'assistant',
      content: 'Let me',
      toolCalls: [call('tc1', 'run_command', '{"command":"pnpm add zod"}')],
    };
    run = fold(
      [
        {
          type: EventType.RUN_FINISHED,
          threadId: 't',
          runId: 'r1',
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'int1', reason: 'tool_call', toolCallId: 'tc1', message: 'Install zod?' }],
          },
        },
      ],
      run,
    );
    const tool = () => fromAgUiMessages(messages, run)[0]!.parts[1];
    expect(tool()).toMatchObject({
      state: 'approval-requested',
      input: { command: 'pnpm add zod' },
      approval: { id: 'int1', requestReason: 'Install zod?' },
    });
    expect(deriveAgentState({ status: run.status, message: fromAgUiMessages(messages, run)[0] })).toEqual({
      state: 'awaiting-approval',
      detail: 'run_command',
    });

    run = answerAgUiInterrupt(run, { id: 'int1', approved: true });
    expect(tool()).toMatchObject({ state: 'approval-responded', approval: { id: 'int1', approved: true } });
    // The resumed run clears the open interrupts but keeps the decision on the call.
    run = fold([{ type: EventType.RUN_STARTED, threadId: 't', runId: 'r2' }], run);
    messages.push({ id: 't1', role: 'tool', toolCallId: 'tc1', content: 'added zod' });
    expect(tool()).toMatchObject({ state: 'output-available', output: 'added zod', approval: { approved: true } });

    const denied = answerAgUiInterrupt(withInterrupt(), { id: 'int1', approved: false, reason: 'Pin it' });
    expect(fromAgUiMessages(messages.slice(0, 1), denied)[0]!.parts[1]).toMatchObject({
      state: 'output-denied',
      approval: { id: 'int1', approved: false, reason: 'Pin it' },
    });
  });
});

function withInterrupt() {
  return createAgUiRun([{ id: 'int1', reason: 'tool_call', toolCallId: 'tc1' }]);
}

/** A real `@ag-ui/client` agent that plays one scripted event list per run. */
class ScriptedAgent extends AbstractAgent {
  inputs: RunAgentInput[] = [];
  constructor(private readonly scripts: ((input: RunAgentInput) => BaseEvent[])[]) {
    super({ threadId: 'thread-1' });
  }
  run(input: RunAgentInput): Observable<BaseEvent> {
    this.inputs.push(input);
    const events = this.scripts[this.inputs.length - 1]!(input);
    return new Observable<BaseEvent>((subscriber) => {
      for (const event of events) subscriber.next(event);
      subscriber.complete();
    });
  }
}

const usage = [{ model: 'gpt-x', inputTokens: 50, outputTokens: 10, totalTokens: 60 }];

function interruptingAgent() {
  return new ScriptedAgent([
    ({ runId }) => [
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId },
      { type: EventType.TEXT_MESSAGE_START, messageId: 'm1', role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm1', delta: 'Adding zod.' },
      { type: EventType.TEXT_MESSAGE_END, messageId: 'm1' },
      { type: EventType.TOOL_CALL_START, toolCallId: 'tc1', toolCallName: 'run_command', parentMessageId: 'm1' },
      { type: EventType.TOOL_CALL_ARGS, toolCallId: 'tc1', delta: '{"command":"pnpm add' },
      { type: EventType.TOOL_CALL_ARGS, toolCallId: 'tc1', delta: ' zod"}' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'tc1' },
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread-1',
        runId,
        usage,
        outcome: {
          type: 'interrupt',
          interrupts: [{ id: 'int1', reason: 'tool_call', toolCallId: 'tc1', message: 'Install zod?' }],
        },
      } as BaseEvent,
    ],
    ({ runId }) => [
      { type: EventType.RUN_STARTED, threadId: 'thread-1', runId },
      { type: EventType.TOOL_CALL_RESULT, messageId: 'tm1', toolCallId: 'tc1', content: '{"exitCode":0}' },
      { type: EventType.TEXT_MESSAGE_START, messageId: 'm2', role: 'assistant' },
      { type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm2', delta: 'Installed.' },
      { type: EventType.TEXT_MESSAGE_END, messageId: 'm2' },
      { type: EventType.RUN_FINISHED, threadId: 'thread-1', runId, usage, outcome: { type: 'success' } } as BaseEvent,
    ],
  ]);
}

describe('useAgUiAgent', () => {
  it('accepts @ag-ui/client agents as they are', () => {
    const agent: AgUiAgentLike = new HttpAgent({ url: 'https://example.com/agent' });
    expect(agent.messages).toEqual([]);
  });

  it('follows a run through an interrupt, the approval and the resumed run', async () => {
    const agent = interruptingAgent();
    agent.addMessage({ id: 'u1', role: 'user', content: 'Add zod' });
    const { result } = renderHook(() => useAgUiAgent(agent));
    expect(result.current.messages).toEqual([{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Add zod' }] }]);

    await act(() => agent.runAgent());
    expect(result.current.status).toBe('ready');
    expect(result.current.interrupts).toHaveLength(1);
    expect(result.current.messages[1]).toMatchObject({
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Adding zod.', state: 'done' },
        {
          type: 'dynamic-tool',
          toolName: 'run_command',
          state: 'approval-requested',
          input: { command: 'pnpm add zod' },
          approval: { id: 'int1', requestReason: 'Install zod?' },
        },
      ],
    });

    await act(() => result.current.respond({ id: 'int1', approved: true }));
    expect(agent.inputs[1]?.resume).toEqual([{ interruptId: 'int1', status: 'resolved', payload: { approved: true } }]);
    expect(result.current.interrupts).toEqual([]);
    expect(result.current.messages[1]!.parts).toMatchObject([
      { type: 'text', text: 'Adding zod.' },
      { state: 'output-available', output: { exitCode: 0 }, approval: { approved: true } },
      { type: 'text', text: 'Installed.' },
    ]);
    expect(result.current.usage).toMatchObject({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
  });

  it('drives AgentMessage approval cards', async () => {
    const agent = interruptingAgent();
    function Chat() {
      const { messages, status, respond } = useAgUiAgent(agent);
      return (
        <>
          <p>{status}</p>
          {messages
            .filter((m) => m.role === 'assistant')
            .map((m) => (
              <AgentMessage key={m.id} message={m} onToolApproval={respond} />
            ))}
        </>
      );
    }
    const user = userEvent.setup();
    render(<Chat />);
    await act(() => agent.runAgent());
    expect(screen.getByText('Install zod?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^approve/i }));
    await waitFor(() => {
      expect(screen.getByText('Installed.')).toBeInTheDocument();
    });
    expect(agent.inputs).toHaveLength(2);
  });

  it('reports a failed run', async () => {
    const agent = new ScriptedAgent([
      ({ runId }) => [
        { type: EventType.RUN_STARTED, threadId: 'thread-1', runId },
        { type: EventType.RUN_ERROR, message: 'Model overloaded', code: 'overloaded' },
      ],
    ]);
    const { result } = renderHook(() => useAgUiAgent(agent));
    await act(() => agent.runAgent().catch(() => undefined));
    expect(result.current).toMatchObject({
      status: 'error',
      error: { message: 'Model overloaded', code: 'overloaded' },
    });
  });
});
