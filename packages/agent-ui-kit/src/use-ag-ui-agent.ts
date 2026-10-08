'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { ChatStatus, UIMessage } from 'ai';
import type { RunUsage } from './lib/ai';
import {
  answerAgUiInterrupt,
  createAgUiRun,
  fromAgUiMessages,
  getAgUiResume,
  reduceAgUiRun,
  type AgUiApprovalResponse,
  type AgUiEvent,
  type AgUiInterrupt,
  type AgUiMessage,
  type AgUiResumeEntry,
  type AgUiRunState,
} from './lib/ag-ui';

/** What `useAgUiAgent` uses of an agent. Any `@ag-ui/client` agent fits: `HttpAgent`, or an integration's own `AbstractAgent`. */
export interface AgUiAgentLike {
  messages: readonly AgUiMessage[];
  pendingInterrupts?: readonly AgUiInterrupt[] | undefined;
  subscribe(subscriber: AgUiSubscriber): { unsubscribe(): void };
  runAgent(parameters?: { resume?: AgUiResumeEntry[] }): Promise<unknown>;
  abortRun?(): void;
}

/** The subscriber callbacks `useAgUiAgent` registers (a subset of `@ag-ui/client`'s `AgentSubscriber`). */
export interface AgUiSubscriber {
  onRunInitialized?(params: { messages: readonly AgUiMessage[] }): void;
  onEvent?(params: { event: AgUiEvent }): void;
  onMessagesChanged?(params: { messages: readonly AgUiMessage[] }): void;
  onRunFailed?(params: { error: Error }): void;
  onRunFinalized?(params: { messages: readonly AgUiMessage[] }): void;
}

export interface UseAgUiAgentResult {
  /** The conversation as AI SDK messages: pass each to `AgentMessage`. */
  messages: UIMessage[];
  /** `useChat`-style status, for `deriveAgentState` and `AgentStatus`. */
  status: ChatStatus;
  error: AgUiRunState['error'];
  /** Token usage summed over the runs seen, for `RunMeter`. */
  usage: RunUsage | undefined;
  /** The step in progress, e.g. a LangGraph node. */
  step: string | undefined;
  /** Open interrupts. Those bound to a tool call show as approval cards; answer the rest with `resolve`. */
  interrupts: AgUiInterrupt[];
  /**
   * Answer a tool-call interrupt. Pass it as `AgentMessage`'s `onToolApproval`. The agent resumes
   * once every open interrupt has an answer, since AG-UI resumes them all in one run.
   */
  respond: (response: AgUiApprovalResponse) => Promise<void>;
  /** Answer any interrupt with your own payload (match its `responseSchema`). */
  resolve: (entry: AgUiResumeEntry) => Promise<void>;
  /** Abort the run in progress. */
  stop: () => void;
}

interface Snapshot {
  messages: readonly AgUiMessage[];
  run: AgUiRunState;
}

/** The agent's messages and run state as an external store, subscribed while a component reads it. */
function createStore(agent: AgUiAgentLike) {
  let snapshot: Snapshot = { messages: [...agent.messages], run: createAgUiRun(agent.pendingInterrupts) };
  const listeners = new Set<() => void>();
  let subscription: { unsubscribe(): void } | undefined;
  const set = (next: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  const update = (next: (run: AgUiRunState) => AgUiRunState) => {
    set({ run: next(snapshot.run) });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!subscription) {
        // Catch up on anything that happened before the first subscriber.
        snapshot = { ...snapshot, messages: [...agent.messages] };
        subscription = agent.subscribe({
          onRunInitialized: ({ messages }) => {
            set({ messages: [...messages], run: { ...snapshot.run, status: 'submitted', error: undefined } });
          },
          onEvent: ({ event }) => {
            update((run) => reduceAgUiRun(run, event));
          },
          onMessagesChanged: ({ messages }) => {
            set({ messages: [...messages] });
          },
          onRunFailed: ({ error }) => {
            update((run) => ({
              ...reduceAgUiRun(run, { type: 'RUN_ERROR' }),
              error: { message: error.message || 'Run failed' },
            }));
          },
          onRunFinalized: ({ messages }) => {
            set({ messages: [...messages] });
            // Aborted runs end without RUN_FINISHED.
            update((run) =>
              run.status === 'submitted' || run.status === 'streaming'
                ? reduceAgUiRun(run, { type: 'RUN_FINISHED' })
                : run,
            );
          },
        });
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          subscription?.unsubscribe();
          subscription = undefined;
        }
      };
    },
    /** Record an answer; returns the resume entries once every open interrupt has one. */
    answer(response: AgUiApprovalResponse | AgUiResumeEntry) {
      update((run) => answerAgUiInterrupt(run, response));
      return getAgUiResume(snapshot.run);
    },
  };
}

/**
 * Render an AG-UI agent with these components: its messages as AI SDK parts, run status, usage,
 * and tool-call interrupts as approvals.
 *
 * ```tsx
 * const agent = useMemo(() => new HttpAgent({ url: '/api/agent' }), []);
 * const { messages, status, respond } = useAgUiAgent(agent);
 * ```
 */
export function useAgUiAgent(agent: AgUiAgentLike): UseAgUiAgentResult {
  const store = useMemo(() => createStore(agent), [agent]);
  const { messages, run } = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  const answer = useCallback(
    async (response: AgUiApprovalResponse | AgUiResumeEntry) => {
      const resume = store.answer(response);
      if (resume) await agent.runAgent({ resume });
    },
    [agent, store],
  );

  return {
    messages: useMemo(() => fromAgUiMessages(messages, run), [messages, run]),
    status: run.status,
    error: run.error,
    usage: run.usage,
    step: run.step,
    interrupts: run.interrupts,
    respond: answer,
    resolve: answer,
    stop: useCallback(() => agent.abortRun?.(), [agent]),
  };
}
