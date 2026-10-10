signoff-ui is a set of React components for the parts of an agent product that aren't the chat bubble: watching an agent work, approving what it does, reviewing what it changed, and understanding what the run cost. They render the message parts the AI SDK's `useChat` already gives you, and AG-UI agents through an adapter, so there's no new runtime or state model to adopt.

It works with any model and costs nothing extra. The kit calls no model, needs no API key and makes no network requests of its own. Your backend picks the model and holds the keys: OpenAI GPT, Anthropic Claude, Google Gemini, xAI Grok, Mistral or a local model through any AI SDK provider, or an agent on any AG-UI framework (LangGraph, CrewAI, Mastra and the rest). Switching providers is [one line in your route](/docs/getting-started#choosing-a-model); the components don't change.

## Why it exists

Most AI UI libraries are built around the chat bubble. Agents changed what the interface has to do. A single run can call a dozen tools, stop to ask permission before something risky, propose edits across several files, and burn through tens of thousands of tokens. The questions people have are about the run:

- **What is it doing right now, and what already happened?** Which calls ran, in what order, how long each took, which ones failed and why.
- **Should I let it do that?** What exactly will run, how risky it is, and a fast, keyboard-friendly way to say yes, no, or no with a reason.
- **What did it change, and do I accept it?** Hunk by hunk, not all or nothing, with the result fed back to the agent.
- **What did that cost?** Tokens, cache efficiency, time to first token, and time spent working rather than waiting on you.

## What's in it

| Export                             | What it renders                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `AgentMessage`                     | A whole assistant message: reasoning, streaming markdown, consecutive tool calls as one timeline, approvals inline, files and sources |
| `ToolCallTimeline`                 | Every tool call with its state, a measured duration and a waterfall; errors inline, input and output on demand                        |
| `ApprovalCard`, `ToolApprovalCard` | Human-in-the-loop approval with a preview of what will run, a risk level when given, and deny with a reason                           |
| `DiffReview`                       | Per-hunk review of edits across files; returns each file with only the accepted hunks applied                                         |
| `RunMeter`                         | Tokens, estimated cost, time to first token, active time and prompt-cache hit rate                                                    |
| `AgentStatus`                      | The run's state in one pill, announced to screen readers                                                                              |
| `Sources`                          | Citations as chips or cards, linked from `[n]` markers in the text                                                                    |
| `useAgUiAgent`                     | An AG-UI agent's run as AI SDK messages, status, usage and approvals                                                                  |

`Markdown`, `Reasoning` and `JsonView` are exported on their own too, with hooks such as `useRunTiming` and pure helpers such as `deriveAgentState`, `addUsage`, `estimateCost` and `applyHunks`. The helpers are also in `signoff-ui/core`, which has no React, for Route Handlers and Server Components.

## How it reads a run

Each AI SDK 6 or 7 message part has a place:

| AI SDK 6 / 7                                 | Rendered as                                                                                              |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `text` (`state: 'streaming' \| 'done'`)      | `Markdown`, repaired while streaming, with a caret and `[n]` citation links                              |
| `reasoning`                                  | `Reasoning`: open while streaming, then "Thought for 1.7s"                                               |
| `tool-*` / `dynamic-tool`, `input-streaming` | Timeline row "Preparing", partial input visible                                                          |
| `input-available`                            | "Running", live duration ("Stopped" once the run is no longer `active`)                                  |
| `approval-requested`                         | "Needs approval" and a `ToolApprovalCard` that calls `addToolApprovalResponse({ id, approved, reason })` |
| `approval-responded`                         | "Running" if approved, "Denied" if not                                                                   |
| `output-available`                           | Done, output in a JSON view or your `renderOutput`                                                       |
| `output-error`                               | "Failed", the error inline, announced                                                                    |
| `output-denied`                              | "Denied", with the user's reason, or "Blocked by policy" when the approval was automatic                 |
| client-side tool, `input-available`          | Whatever `renderTool` returns, such as a `DiffReview` that calls `addToolOutput`                         |
| `source-url` / `source-document`             | `Sources`                                                                                                |
| `file`                                       | An image preview or a file link                                                                          |
| `data-*`                                     | `renderData`                                                                                             |
| `message.metadata.usage`                     | `RunMeter`                                                                                               |
| `useChat().status`                           | `AgentStatus` through `deriveAgentState`, timing through `useRunTiming`                                  |

The kit depends on `ai` for types only. Part detection (`isToolPart`, `getToolPartName`) mirrors the SDK's runtime helpers, and a test checks they agree.

The [playground](/) doesn't fake any of this. Its scripted agent is a `ChatTransport` that streams real `UIMessageChunk`s through `useChat`, so the SDK assembles the parts, merges usage metadata, and drives the approval and client-tool round trips as it would against a server.

## Design decisions

- **A run, not a message.** Consecutive tool parts become one timeline instead of a stack of cards, and status and telemetry live outside the message.
- **Timings are measured, not invented.** Message parts carry no timestamps, so the timeline records state changes on the client. Execution time starts when a call is approved, so waiting on a person never reads as a slow tool.
- **Review returns code.** `DiffReview`'s `onSubmit` includes each file with only the accepted hunks applied, so it works as a client-side tool result that goes straight back to the model.
- **Shortcuts scoped to focus.** Single-key shortcuts only fire while focus is inside the component, which keeps them out of text fields and within WCAG 2.1.4.
- **Two ways to install, one source.** The npm package and the shadcn registry are built from the same files, and CI fails if they drift.

## Next steps

- [Getting started](/docs/getting-started): install, styles, a first run in Next.js, AI SDK 6 or 7, and theming.
- [AG-UI agents](/docs/ag-ui): LangGraph, CrewAI, Mastra and other AG-UI agents through `useAgUiAgent`.
- [Components](/gallery): each component in isolation, with install snippets.
