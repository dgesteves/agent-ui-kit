---
'@dgesteves/agent-ui-kit': minor
---

Approval cards claim only what you told them, and read better with a screen reader.

- **`risk` has no default.** It used to default to `'medium'`, so every card, and every `ToolApprovalCard` for a tool without `risk` in its meta, said "Medium risk" when nobody had rated it. Without `risk`, the card now shows no risk badge, uses its neutral colors and has no `data-risk`.
- **A neutral reason placeholder.** The denial reason field said "e.g. Use the existing Redis client instead", copy from the demo. It now says "What should the agent do instead?", and the new `reasonPlaceholder` prop sets your own.
- **Not a landmark.** `ApprovalCard` is a group named by its title (`role="group"`), not a region landmark, so a run with many approvals no longer fills landmark navigation. Pass `role="region"` to make it one. Tests that find the card with `getByRole('region')` need `getByRole('group')`.
- **"Approved" once.** A decided card read "Approved, Approved": the announcement stayed in the card next to the outcome. The announcement now clears 3 seconds after it is made.
- **`ToolCallTimeline`.**
  - Calls that settle together, such as parallel calls, are announced in one message, after a 300 ms pause. Before, only the last one was announced.
  - Calls that had already settled when the timeline mounted are not announced.
  - The awaiting-approval "!" beside a call is hidden from screen readers; the call's button already says "Needs approval".
