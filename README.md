# signoff-ui

Review what your agent changed and control what it may do: React components for multi-file diff review and tool approvals, for AI SDK and AG-UI agents, inside the chat UI you already have.

[![CI](https://img.shields.io/github/actions/workflow/status/dgesteves/signoff-ui/ci.yml?branch=main&label=CI&labelColor=0d0f12&color=22d3ee)](https://github.com/dgesteves/signoff-ui/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/signoff-ui?labelColor=0d0f12&color=22d3ee)](https://www.npmjs.com/package/signoff-ui)
[![License: MIT](https://img.shields.io/badge/license-MIT-22d3ee?labelColor=0d0f12)](./LICENSE)

<!-- npm-readme:video -->

https://github.com/user-attachments/assets/eb7c6a77-555f-4f6e-badf-230ebeeba45e

<sub>The <a href="https://agent-ui-kit-demo.vercel.app">playground</a>, driven from the keyboard: tool calls stream into the timeline, <kbd>Y</kbd> approves the install, <kbd>A</kbd>/<kbd>R</kbd> review hunks, <kbd>Ctrl</kbd>+<kbd>↵</kbd> applies. Then the <a href="https://agent-ui-kit-demo.vercel.app/gallery#ag-ui">AG-UI demo</a>, a real <code>@ag-ui/client</code> agent that resumes once you approve.</sub>

<!-- npm-readme:image
<p align="center">
  <a href="https://agent-ui-kit-demo.vercel.app"><img src="docs/media/demo.webp" width="100%" alt="The playground driven from the keyboard: tool calls stream into a timeline, Y approves a package install, A and R accept and reject diff hunks, Ctrl+Enter applies them and the run meter shows the cost. Then the AG-UI demo: a LangGraph-style run that resumes once the install is approved."></a>
</p>

<sub>The <a href="https://agent-ui-kit-demo.vercel.app">playground</a>, driven from the keyboard: tool calls stream into the timeline, <kbd>Y</kbd> approves the install, <kbd>A</kbd>/<kbd>R</kbd> review hunks, <kbd>Ctrl</kbd>+<kbd>↵</kbd> applies. Then the <a href="https://agent-ui-kit-demo.vercel.app/gallery#ag-ui">AG-UI demo</a>, a real <code>@ag-ui/client</code> agent that resumes once you approve.</sub>
-->

## Why it exists

Coding and editing agents propose changes across several files and ask to run commands that can break things, and someone has to sign off on both. The chat kits most teams use stop short there: assistant-ui's reviewable diff takes one file's hunks, already split, and its apply returns nothing, while AI Elements has no diff at all and a confirm/deny you wire up yourself. `DiffReview` computes the hunks from each file's old and new contents, lets a person accept or reject them from the keyboard, and gives the agent back each file with only the accepted hunks applied. `ApprovalCard` shows exactly what will run and how risky it is, takes a reason with a denial, lets a person approve once, for the session or always (by tool and argument pattern) and edit the arguments first, and tells automatic decisions apart from a person's.

## Quickstart

```bash
npm i signoff-ui ai @ai-sdk/react @ai-sdk/openai zod
```

Add the styles once: `@import 'signoff-ui/tailwind.css';` after Tailwind v4 in your CSS, or `import 'signoff-ui/styles.css';` with Tailwind v3 or none.

**The route.** The agent proposes edits through `review_changes`, a tool with no `execute`, so the page answers it. `toolApproval` makes AI SDK 7 stop and ask before `run_command`:

```ts
// app/api/chat/route.ts (excerpt)
import { openai } from '@ai-sdk/openai';
import { addUsage } from 'signoff-ui/core';
import { convertToModelMessages, stepCountIs, streamText, tool, type LanguageModelUsage, type UIMessage } from 'ai';
import { z } from 'zod';
// …
const tools = {
  // …
  // No execute: the page answers it with a DiffReview, and the result holds each file as applied.
  review_changes: tool({
    description: 'Propose edits to files. The user reviews them hunk by hunk before anything is written.',
    inputSchema: z.object({
      files: z.array(z.object({ path: z.string(), oldContent: z.string().optional(), newContent: z.string() })),
    }),
  }),
  run_command: tool({
    description: 'Run a shell command in the repository.',
    inputSchema: z.object({ command: z.string() }),
    execute: async ({ command }) => ({ exitCode: 0, stdout: `(simulated) ${command}` }),
  }),
};
// …
const result = streamText({
  model: openai('gpt-5.4-mini'),
  messages: await convertToModelMessages(messages, { tools }),
  tools,
  // Ask before running commands. The reason shows on the approval card.
  toolApproval: { run_command: { type: 'user-approval', reason: 'Runs a shell command in the repository.' } },
  // Keep going after tool calls: the AI SDK stops after the first step by default.
  stopWhen: stepCountIs(10),
});
```

**The page.** `AgentMessage` lays out the run with the approval card inline, and `renderTool` puts a `DiffReview` where the proposed edit is. Its `onSubmit` result goes back to the agent as the tool's output, and the run continues once every answer is in:

```tsx
// app/agent-run.tsx (excerpt)
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
// …
const { messages, status, sendMessage, addToolOutput, addToolApprovalResponse } = useChat<Message>({
  // Continue the run once the review is in and every approval has an answer.
  sendAutomaticallyWhen: (chat) =>
    lastAssistantMessageIsCompleteWithToolCalls(chat) || lastAssistantMessageIsCompleteWithApprovalResponses(chat),
});
// …
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
```

The whole app, with a status pill and a cost meter, is [examples/nextjs-minimal](examples/nextjs-minimal): it runs against a scripted model with no API key, and CI drives it in Chrome through the review, the approval and the final answer. [Getting started](https://agent-ui-kit-demo.vercel.app/docs/getting-started) walks through it, including AI SDK 6, other models and the shadcn registry (`npx shadcn@latest add @signoff-ui/diff-review`).

## Works inside assistant-ui, AI Elements or your own chat

The components take AI SDK message parts and plain props, not a runtime, and `styles.css` styles only their own elements, never the rest of your page or the content you render inside them.

- **Your own chat:** render `AgentMessage` for the assistant's message, as above, or only `DiffReview` and `ToolApprovalCard` for the tool parts you want to gate.
- **AI Elements:** keep its conversation, messages and prompt input, and render `ToolApprovalCard` or `DiffReview` for those tool parts in place of `Tool` and `Confirmation`.
- **assistant-ui:** with `useAISDKRuntime(useChat())`, `getExternalStoreMessages` hands back the `UIMessage` behind a thread message, and `AgentMessage` renders it inside a `Thread`, approvals included. The binding it reads is marked experimental in assistant-ui's types.
- **AG-UI agents** (LangGraph, CrewAI, Mastra and others): `useAgUiAgent` from `signoff-ui/ag-ui` turns the run into the same message parts, with interrupts as approval cards.

[Inside your chat UI](https://agent-ui-kit-demo.vercel.app/docs/chat-ui) has the code for each.

## Components

| Role       | Component                                               | What it does                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Review     | `DiffReview`                                            | Unified or split review of edits across files, computed from their contents or a patch, with word-level highlights. Accept or reject each hunk from the keyboard; `onSubmit` returns each file with only the accepted hunks applied.                                                                                                                                   |
| Approve    | `ApprovalCard`, `ToolApprovalCard`, `useApprovalPolicy` | What will run, its risk when you rate it, approve or deny with a reason, a second press for `critical` actions, and "Auto-approved" or "Blocked by policy" for automatic decisions. Approve once, for the session or always, by tool and argument pattern; edit the arguments first; approve all pending; an audit trail; the same rules as AI SDK 7's `toolApproval`. |
| Supporting | `AgentMessage`                                          | A whole assistant message: streaming markdown, reasoning, tool calls as one timeline with approvals inline, files and sources.                                                                                                                                                                                                                                         |
|            | `ToolCallTimeline`                                      | Every tool call's state, measured duration and a waterfall, errors inline.                                                                                                                                                                                                                                                                                             |
|            | `RunMeter`, `AgentStatus`                               | Tokens, estimated cost and time to first token; the run's state in one announced pill.                                                                                                                                                                                                                                                                                 |
|            | `Sources`, `Markdown`, `Reasoning`                      | Citations, streaming-safe markdown and collapsible reasoning.                                                                                                                                                                                                                                                                                                          |
|            | `useAgUiAgent`                                          | An AG-UI agent's run as AI SDK messages, status, usage and approvals.                                                                                                                                                                                                                                                                                                  |

Typed against AI SDK 6 and 7 (`ai@^6.0.0 || ^7.0.102`), on React 18 and 19 (`react@^18.2.0 || ^19.0.0`), with Tailwind v4, v3 or no Tailwind, each tested in CI. Keyboard-first and announced to screen readers, with axe checks in jsdom and in Chrome. The kit calls no model and makes no requests of its own, so any model your backend uses works.

## Docs

- [Live playground](https://agent-ui-kit-demo.vercel.app): a scripted coding-agent run with a review and an approval, driven from the keyboard. No API key.
- [Docs](https://agent-ui-kit-demo.vercel.app/docs): [Getting started](https://agent-ui-kit-demo.vercel.app/docs/getting-started), [Inside your chat UI](https://agent-ui-kit-demo.vercel.app/docs/chat-ui), [AG-UI agents](https://agent-ui-kit-demo.vercel.app/docs/ag-ui), [theming](https://agent-ui-kit-demo.vercel.app/docs/getting-started#theming), [accessibility](https://agent-ui-kit-demo.vercel.app/docs/accessibility), [performance and limits](https://agent-ui-kit-demo.vercel.app/docs/limits), and a page per component with its props, keyboard and styling hooks. Also as [`/llms.txt`](https://agent-ui-kit-demo.vercel.app/llms.txt) and [`/llms-full.txt`](https://agent-ui-kit-demo.vercel.app/llms-full.txt) for coding agents.
- Formerly `@dgesteves/agent-ui-kit`: [Migrating](https://agent-ui-kit-demo.vercel.app/docs/migrating-from-agent-ui-kit) is a package swap and one command.
- [Changelog](packages/signoff-ui/CHANGELOG.md), [contributing](CONTRIBUTING.md) and [security](SECURITY.md).

## How it compares

signoff-ui does one part of an agent product in depth: the review and approval step. [assistant-ui](https://github.com/assistant-ui/assistant-ui) and [AI Elements](https://github.com/vercel/ai-elements) cover the whole chat, and they do several things better:

- **assistant-ui** has a chat runtime and thread, adapters for the AI SDK, LangGraph, AG-UI and more, and an Elements collection far wider than this kit. Its task card shows nested sub-agents, which this kit renders flat.
- **AI Elements** covers the most of the message surface in shadcn style (conversation, prompt input, artifacts, a `Context` usage indicator and more), maintained by Vercel. Its components are written against AI SDK 6.

Where signoff-ui goes further: review from file contents across several files, with the patched files as the result; approvals once, for the session or always, by tool and argument pattern, with the arguments editable first and the same rules for AI SDK 7's `toolApproval`; approvals that tell a person's decision from a policy's; tool durations that leave out time spent waiting for a person; and a stylesheet for Tailwind v3 or no Tailwind. Use either library for the chat, and these components for the sign-off. [The full comparison](https://agent-ui-kit-demo.vercel.app/docs/comparison).

## License

[MIT](./LICENSE) © Diogo Esteves
