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
  /** Calls `useChat().addToolOutput` with `reviewToolOutput(review)` as the tool's output. */
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

`signoff-ui/assistant-ui` renders the kit for assistant-ui's tool calls, with whatever runtime draws the thread. `signoffTools()` goes in `MessagePrimitive.Parts`' `components.tools`. A call to one of its `review` tools gets a `DiffReview`, and the review goes back as the call's result through `addResult`. Any other call at an approval gate gets the approval card, answered through `respondToApproval`. `SignoffToolsProvider`, optional, passes approval rules from `useApprovalPolicy`, risk levels by tool, and props for the reviews and the cards.

```package-install
npm i signoff-ui @assistant-ui/react
```

`@assistant-ui/react` is an optional peer dependency of signoff-ui, needed only for this entry, which uses its types and none of its code. With the shadcn CLI, the binding is the `assistant-ui` item: `npx shadcn@latest add @signoff-ui/assistant-ui`.

With the AI SDK runtime, against the `review_changes` and `run_command` tools of [Getting started](/docs/getting-started#render-a-run):

```tsx title="components/thread.tsx"
'use client';

import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { useChatRuntime } from '@assistant-ui/react-ai-sdk';
import { lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useApprovalPolicy } from 'signoff-ui';
import { SignoffToolsProvider, signoffTools } from 'signoff-ui/assistant-ui';

// review_changes gets a DiffReview; any call with an approval gate gets the approval card.
const tools = signoffTools({ review: ['review_changes'] });

function AssistantMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts components={{ tools }} />
    </MessagePrimitive.Root>
  );
}

function UserMessage() {
  return (
    <MessagePrimitive.Root>
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}

export function Thread() {
  const runtime = useChatRuntime({
    // Continue the run once the review is in and every approval has an answer.
    sendAutomaticallyWhen: (chat) =>
      lastAssistantMessageIsCompleteWithToolCalls(chat) || lastAssistantMessageIsCompleteWithApprovalResponses(chat),
  });
  const policy = useApprovalPolicy();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SignoffToolsProvider policy={policy} tools={{ run_command: { risk: 'high' } }}>
        <ThreadPrimitive.Root>
          <ThreadPrimitive.Viewport>
            <ThreadPrimitive.Messages>
              {({ message }) => (message.role === 'assistant' ? <AssistantMessage /> : <UserMessage />)}
            </ThreadPrimitive.Messages>
          </ThreadPrimitive.Viewport>
          <ComposerPrimitive.Root>
            <ComposerPrimitive.Input aria-label="Message the agent" />
            <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
        </ThreadPrimitive.Root>
      </SignoffToolsProvider>
    </AssistantRuntimeProvider>
  );
}
```

This ran end to end against the quickstart's scripted model, the review, an approval for the session and the resumed answer, with `@assistant-ui/react` 0.15 and `@assistant-ui/react-ai-sdk` 1.4. [examples/assistant-ui](https://github.com/dgesteves/signoff-ui/tree/main/examples/assistant-ui) runs the same on assistant-ui's local runtime with a scripted model in the page, no API key and no server. CI builds it from the packed package and drives a review, an approval and a rule's automatic answer in Chrome.

- **Your own components for some tools:** pass `Fallback` to `signoffTools` for calls with no approval gate, or render `ReviewToolUI` and `ApprovalToolUI` inside your own tool components. They take the tool-call props assistant-ui passes.
- **Approval rules:** with a `policy`, the card offers once, this session and always, and a call a rule already decides is answered without a card once the run has paused for it.
- **What the cards answer:** plain approve-or-deny gates. A request that asks a question or offers options to select (`display` other than `"decision"`) renders nothing here, so you can render your own for it.

## AG-UI agents

LangGraph, CrewAI, Mastra and other AG-UI agents render through `useAgUiAgent`, which turns the run into the same message parts, interrupts as approvals. See [AG-UI agents](/docs/ag-ui).
