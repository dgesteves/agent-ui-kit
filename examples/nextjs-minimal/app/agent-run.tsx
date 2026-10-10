'use client';

import { useChat } from '@ai-sdk/react';
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  type LanguageModelUsage,
  type UIMessage,
} from 'ai';
import { useState } from 'react';
import {
  AgentMessage,
  AgentStatus,
  DiffReview,
  RunMeter,
  deriveAgentState,
  getToolPartName,
  useRunTiming,
  type FileChange,
} from 'signoff-ui';

type Message = UIMessage<{ usage?: LanguageModelUsage }>;

export function AgentRun() {
  const { messages, status, sendMessage, addToolOutput, addToolApprovalResponse } = useChat<Message>({
    // Continue the run once the review is in and every approval has an answer.
    sendAutomaticallyWhen: (chat) =>
      lastAssistantMessageIsCompleteWithToolCalls(chat) || lastAssistantMessageIsCompleteWithApprovalResponses(chat),
  });
  const [input, setInput] = useState('');
  const last = messages.findLast((m) => m.role === 'assistant');
  // review_changes waits on a person, like an approval.
  const { state, detail } = deriveAgentState({ status, message: last, pendingClientTools: ['review_changes'] });
  // A run starts with each message you send and spans its review and approval round trips.
  const timing = useRunTiming(status, messages);

  return (
    // The kit's own background and text colors, so it reads well on any page. Add `dark` for the dark theme.
    <div className="bg-signoff-bg text-signoff-fg mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <AgentStatus state={state} detail={detail} elapsedMs={timing.activeMs} />
      {last && (
        <AgentMessage
          message={last}
          streaming={status === 'streaming'}
          // Once the run has finished, been stopped or failed, calls that never settled read "Stopped".
          active={state !== 'done' && state !== 'stopped' && state !== 'error'}
          onToolApproval={addToolApprovalResponse}
          // The proposed edit, reviewed hunk by hunk. The agent gets each file as you applied it.
          renderTool={(part) =>
            getToolPartName(part) === 'review_changes' && part.state === 'input-available' ? (
              <DiffReview
                files={(part.input as { files: FileChange[] }).files}
                onSubmit={(review) =>
                  addToolOutput({ tool: 'review_changes', toolCallId: part.toolCallId, output: review })
                }
              />
            ) : undefined
          }
        />
      )}
      <RunMeter
        usage={last?.metadata?.usage}
        pricing={{ input: 2.5, cachedInput: 0.25, output: 10 }}
        ttftMs={timing.ttftMs}
        durationMs={timing.activeMs}
      />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim()) return;
          void sendMessage({ text: input });
          setInput('');
        }}
      >
        <input
          aria-label="Message the agent"
          placeholder="Ask the agent to change something"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="border-signoff-border bg-signoff-surface flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={status !== 'ready' && status !== 'error'}
          className="bg-signoff-accent text-signoff-on-accent rounded-lg px-4 text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
