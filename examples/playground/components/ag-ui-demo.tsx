'use client';

import { AbstractAgent, type BaseEvent, type RunAgentInput } from '@ag-ui/client';
import { EventType } from '@ag-ui/core';
import { AgentMessage, AgentStatus, RunMeter, deriveAgentState } from '@dgesteves/agent-ui-kit';
import { useAgUiAgent } from '@dgesteves/agent-ui-kit/ag-ui';
import { useState } from 'react';
import { Observable } from 'rxjs';
import { FINDINGS, PRICING, REDIS, SEARCH_CODE_OUTPUT } from '@/lib/scenario';
import { toolMeta } from '@/lib/tools';

const PROMPT = 'Add rate limiting to /api/chat';

/** Split streamed content into deltas, the way a model emits it. */
const deltas = (text: string, size: number) => text.match(new RegExp(`[\\s\\S]{1,${String(size)}}`, 'g')) ?? [];

const step = (stepName: string, events: BaseEvent[]): BaseEvent[] => [
  { type: EventType.STEP_STARTED, stepName } as BaseEvent,
  ...events,
  { type: EventType.STEP_FINISHED, stepName } as BaseEvent,
];

const text = (messageId: string, content: string): BaseEvent[] => [
  { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' } as BaseEvent,
  ...deltas(content, 6).map((delta) => ({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta }) as BaseEvent),
  { type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent,
];

const reasoning = (messageId: string, content: string): BaseEvent[] => [
  { type: EventType.REASONING_START, messageId } as BaseEvent,
  { type: EventType.REASONING_MESSAGE_START, messageId, role: 'reasoning' } as BaseEvent,
  ...deltas(content, 8).map((delta) => ({ type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta }) as BaseEvent),
  { type: EventType.REASONING_MESSAGE_END, messageId } as BaseEvent,
  { type: EventType.REASONING_END, messageId } as BaseEvent,
];

const tool = (toolCallId: string, toolCallName: string, args: object, result?: object): BaseEvent[] => [
  { type: EventType.TOOL_CALL_START, toolCallId, toolCallName } as BaseEvent,
  ...deltas(JSON.stringify(args), 5).map(
    (delta) => ({ type: EventType.TOOL_CALL_ARGS, toolCallId, delta }) as BaseEvent,
  ),
  { type: EventType.TOOL_CALL_END, toolCallId } as BaseEvent,
  ...(result ? [toolResult(toolCallId, result)] : []),
];

const toolResult = (toolCallId: string, result: object) =>
  ({
    type: EventType.TOOL_CALL_RESULT,
    messageId: `${toolCallId}-result`,
    toolCallId,
    content: JSON.stringify(result),
  }) as BaseEvent;

const usage = (inputTokens: number, cachedInputTokens: number, outputTokens: number) => [
  {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  },
];

/** The first run: plan, research, then stop for approval before installing a package. */
function interruptedRun({ threadId, runId }: RunAgentInput): BaseEvent[] {
  return [
    { type: EventType.RUN_STARTED, threadId, runId } as BaseEvent,
    ...step(
      'planner',
      reasoning(
        'r1',
        'The limit has to run before streamText opens the stream, so it belongs at the top of the route handler. Check for an existing Redis client first.',
      ),
    ),
    ...step('researcher', [
      ...text('m1', "I'll find the chat route and check for an existing Redis client."),
      ...tool('tc1', 'search_code', { query: 'api/chat route handler' }, SEARCH_CODE_OUTPUT),
      ...tool('tc2', 'read_file', { path: 'lib/redis.ts' }, { path: 'lib/redis.ts', content: REDIS }),
    ]),
    ...step('executor', [
      ...text('m2', FINDINGS),
      ...tool('tc3', 'run_command', { command: 'pnpm add @upstash/ratelimit' }),
    ]),
    {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      usage: usage(8421, 5120, 612),
      outcome: {
        type: 'interrupt',
        interrupts: [
          {
            id: 'install-ratelimit',
            reason: 'tool_call',
            toolCallId: 'tc3',
            message: 'Installs @upstash/ratelimit and updates package.json and pnpm-lock.yaml.',
            responseSchema: { type: 'object', properties: { approved: { type: 'boolean' } }, required: ['approved'] },
          },
        ],
      },
    } as BaseEvent,
  ];
}

/** The resumed run, which reads the answer from `input.resume`. */
function resumedRun({ threadId, runId, resume }: RunAgentInput): BaseEvent[] {
  const approved = (resume?.[0]?.payload as { approved?: boolean } | undefined)?.approved === true;
  return [
    { type: EventType.RUN_STARTED, threadId, runId } as BaseEvent,
    ...step(
      'executor',
      approved
        ? [
            toolResult('tc3', { exitCode: 0, stdout: '+ @upstash/ratelimit 2.0.6' }),
            ...text(
              'm3',
              'Installed. Next I would add a sliding-window check at the top of the handler, before `streamText` opens the stream, and return a **429** with a `Retry-After` header when it trips.',
            ),
          ]
        : [
            ...text(
              'm3',
              "Understood, I won't install anything. I can write a fixed-window limiter on the existing Redis client instead.",
            ),
          ],
    ),
    {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      usage: usage(9204, 8448, 187),
      outcome: { type: 'success' },
    } as BaseEvent,
  ];
}

const delay = (event: BaseEvent) =>
  event.type === EventType.TEXT_MESSAGE_CONTENT ||
  event.type === EventType.REASONING_MESSAGE_CONTENT ||
  event.type === EventType.TOOL_CALL_ARGS
    ? 28
    : event.type === EventType.TOOL_CALL_END
      ? 650
      : 220;

/**
 * A real `@ag-ui/client` agent: instead of an HTTP request, `run` replays a LangGraph-style event
 * stream with model-like pacing. `HttpAgent` against a server would emit the same events.
 */
class ScriptedAgent extends AbstractAgent {
  private runs = 0;

  run(input: RunAgentInput): Observable<BaseEvent> {
    const events = (this.runs++ === 0 ? interruptedRun : resumedRun)(input);
    return new Observable<BaseEvent>((subscriber) => {
      let i = 0;
      let timer: ReturnType<typeof setTimeout>;
      const next = () => {
        const event = events[i++];
        if (!event) {
          subscriber.complete();
          return;
        }
        subscriber.next(event);
        timer = setTimeout(next, delay(event));
      };
      timer = setTimeout(next, 300);
      return () => {
        clearTimeout(timer);
      };
    });
  }
}

function Run({ onReset }: { onReset: () => void }) {
  const [agent] = useState(() => new ScriptedAgent());
  const { messages, status, usage, step, respond } = useAgUiAgent(agent);
  const prompt = messages.find((m) => m.role === 'user');
  const last = messages.findLast((m) => m.role === 'assistant');
  const { state, detail } = deriveAgentState({ status, message: last });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {prompt ? (
          <p className="rounded-lg bg-[#181c22] px-3 py-1.5 text-[13px] text-[#e8eaed]">{PROMPT}</p>
        ) : (
          <button
            type="button"
            onClick={() => {
              agent.addMessage({ id: 'u1', role: 'user', content: PROMPT });
              void agent.runAgent();
            }}
            className="bg-cyan rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#0b0d10] hover:opacity-90"
          >
            Run the AG-UI agent
          </button>
        )}
        <AgentStatus state={state} detail={step ? `${step} · ${detail ?? 'thinking'}` : detail} size="sm" />
        {prompt && (state === 'done' || state === 'error') ? (
          <button
            type="button"
            onClick={onReset}
            className="border-line ml-auto rounded-lg border px-3 py-1.5 font-mono text-xs text-[#a1a9b4] hover:text-[#e8eaed]"
          >
            Reset
          </button>
        ) : null}
      </div>
      {last ? (
        <AgentMessage
          message={last}
          streaming={status === 'streaming'}
          active={state !== 'done' && state !== 'error'}
          tools={toolMeta}
          onToolApproval={respond}
        />
      ) : null}
      {usage ? <RunMeter usage={usage} pricing={PRICING} model="gpt-5.4-mini" /> : null}
    </div>
  );
}

export default function AgUiDemo() {
  const [session, setSession] = useState(0);
  return (
    <Run
      key={session}
      onReset={() => {
        setSession((s) => s + 1);
      }}
    />
  );
}
