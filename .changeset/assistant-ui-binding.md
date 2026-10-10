---
'signoff-ui': minor
---

`signoff-ui/assistant-ui`: review and approve assistant-ui tool calls.

- **`signoffTools({ review })`** goes in `MessagePrimitive.Parts`' `components.tools`. A call to one of the `review` tools gets a `DiffReview` once its arguments are in, and the review goes back as the call's result through `addResult` (`reviewToolOutput(review)`), then stays on the page read-only. Any other call at an approval gate gets the approval card, answered through `respondToApproval`. `Fallback` renders the calls with no gate.
- **`SignoffToolsProvider`**, optional, passes approval rules from `useApprovalPolicy` (once, this session or always, and a call a rule decides is answered without a card once the run has paused for it), labels and risk levels by tool, props for every `DiffReview` and approval card, and `reviewToolOutput`'s options.
- **`ReviewToolUI` and `ApprovalToolUI`** are the two components, for your own tool components.

It works with any assistant-ui runtime; it ran end to end with the AI SDK runtime (`@assistant-ui/react-ai-sdk` 1.4) and the local runtime. `@assistant-ui/react` (`^0.15.0`) is an optional peer dependency: the entry imports only its types, and nothing of it reaches the main entry. The shadcn registry has it as the `assistant-ui` item.

`ToolApprovalCard` with a `policy` no longer answers a call twice when a person's session or always decision adds a rule while the call still reads pending, as it does with a runtime that records the answer a moment later.
