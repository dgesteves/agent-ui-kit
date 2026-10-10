The components take AI SDK message parts and plain props. There is no runtime or store to adopt, so they render inside whatever draws your chat: your own components, AI Elements or an assistant-ui thread. Their names (`data-signoff`, `--signoff-*`, `signoff-*` slots) don't collide with assistant-ui's or shadcn/ui's, and `styles.css` styles only the components' own elements, never your page or the content you render inside them.

The examples below use a `review_changes` tool with no `execute`, which the page answers with a `DiffReview`, and a `run_command` tool that needs approval, as in [Getting started](/docs/getting-started#render-a-run).

## Your own chat

Render `AgentMessage` for the assistant's message, with `onToolApproval` and `renderTool`, as the [quickstart](/docs/getting-started#render-a-run) does. Or keep your own message rendering and use the kit only for the parts a person has to sign off:

```tsx title="components/message-parts.tsx"
'use client';

import type { UIMessage } from 'ai';
import {
  DiffReview,
  ToolApprovalCard,
  getToolPartName,
  isToolPart,
  type DiffReviewResult,
  type FileChange,
  type ToolApprovalResponse,
} from 'signoff-ui';

export function MessageParts({
  message,
  onApproval,
  onReview,
}: {
  message: UIMessage;
  /** `useChat().addToolApprovalResponse` */
  onApproval: (response: ToolApprovalResponse) => void;
  /** Calls `useChat().addToolOutput` with the review as the tool's output. */
  onReview: (toolCallId: string, review: DiffReviewResult) => void;
}) {
  return message.parts.map((part, index) => {
    if (part.type === 'text') return <p key={index}>{part.text}</p>;
    if (!isToolPart(part)) return null;
    if (getToolPartName(part) === 'review_changes' && part.state === 'input-available') {
      const { files } = part.input as { files: FileChange[] };
      return (
        <DiffReview key={part.toolCallId} files={files} onSubmit={(review) => onReview(part.toolCallId, review)} />
      );
    }
    // Renders nothing for calls that need no approval.
    return <ToolApprovalCard key={part.toolCallId} part={part} onRespond={onApproval} />;
  });
}
```

## AI Elements

AI Elements maps each message part to a component: `MessageResponse` for text, `Tool` for a tool call, `Confirmation` for its approval. Keep that, and for the calls a person signs off, render the kit's component in the same map:

```tsx
if (isToolPart(part) && getToolPartName(part) === 'review_changes' && part.state === 'input-available') {
  return <DiffReview key={part.toolCallId} files={(part.input as { files: FileChange[] }).files} onSubmit={…} />;
}
if (isToolPart(part) && part.approval) {
  return <ToolApprovalCard key={part.toolCallId} part={part} onRespond={addToolApprovalResponse} />;
}
// …and AI Elements' Tool for the other calls
```

AI Elements apps run Tailwind v4, so import `signoff-ui/tailwind.css` after Tailwind, and point the kit's tokens at your shadcn/ui ones as [Theming](/docs/getting-started#theming) shows, so the cards match the rest of the chat.

## assistant-ui

With the AI SDK runtime, assistant-ui keeps the `UIMessage` it converted each thread message from. `getExternalStoreMessages` hands it back, and `AgentMessage` renders it inside a `Thread`, with approvals answered through the same `useChat`:

```tsx title="components/thread.tsx"
'use client';

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  ThreadPrimitive,
  getExternalStoreMessages,
  useAuiState,
} from '@assistant-ui/react';
import { useAISDKRuntime } from '@assistant-ui/react-ai-sdk';
import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithApprovalResponses, type UIMessage } from 'ai';
import { createContext, useContext } from 'react';
import { AgentMessage, deriveAgentState } from 'signoff-ui';

type Chat = ReturnType<typeof useChat<UIMessage>>;
const ChatContext = createContext<Chat | null>(null);

function AssistantMessage() {
  const chat = useContext(ChatContext)!;
  const message = useAuiState((s) => s.message);
  const [ui] = getExternalStoreMessages<UIMessage>(message as never);
  if (!ui) return null;
  const isLast = chat.messages.at(-1)?.id === ui.id;
  const { state } = deriveAgentState({ status: chat.status, message: ui });
  return (
    <AgentMessage
      message={ui}
      streaming={isLast && chat.status === 'streaming'}
      active={isLast && state !== 'done' && state !== 'stopped' && state !== 'error'}
      onToolApproval={chat.addToolApprovalResponse}
    />
  );
}

function Message() {
  const role = useAuiState((s) => s.message.role);
  // Your own user message here.
  return role === 'assistant' ? <AssistantMessage /> : null;
}

export function Thread() {
  const chat = useChat<UIMessage>({ sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses });
  const runtime = useAISDKRuntime(chat);
  return (
    <ChatContext.Provider value={chat}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadPrimitive.Root>
          <ThreadPrimitive.Viewport>
            <ThreadPrimitive.Messages>{() => <Message />}</ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>
          <ComposerPrimitive.Root>
            <ComposerPrimitive.Input aria-label="Message the agent" />
            <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </AssistantRuntimeProvider>
    </ChatContext.Provider>
  );
}
```

This ran end to end, a run with an approval and then the resumed answer, with `@assistant-ui/react` 0.15 and `@assistant-ui/react-ai-sdk` 1.4. The binding `getExternalStoreMessages` reads is marked experimental in assistant-ui's types, so check it when you upgrade assistant-ui. Add `renderTool` with a `DiffReview`, and `lastAssistantMessageIsCompleteWithToolCalls` to `sendAutomaticallyWhen`, for reviews.

## AG-UI agents

LangGraph, CrewAI, Mastra and other AG-UI agents render through `useAgUiAgent`, which turns the run into the same message parts, interrupts as approvals. See [AG-UI agents](/docs/ag-ui).
