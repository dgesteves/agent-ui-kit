# @dgesteves/agent-ui-kit

## 0.3.0

### Minor Changes

- [#5](https://github.com/dgesteves/agent-ui-kit/pull/5) [`28c9b64`](https://github.com/dgesteves/agent-ui-kit/commit/28c9b64e278ede6bda742443a28368bec901dd45) Thanks [@dgesteves](https://github.com/dgesteves)! - Render AG-UI agents (LangGraph, CrewAI, Mastra, Pydantic AI and other AG-UI integrations) with the same components. `useAgUiAgent(agent)` from the new `@dgesteves/agent-ui-kit/ag-ui` entry takes an `@ag-ui/client` agent and returns its messages as AI SDK parts, plus `status`, `usage`, `step` and open `interrupts`. Tool-call interrupts become approval cards: pass `respond` as `AgentMessage`'s `onToolApproval`, and the run resumes once every open interrupt has an answer. The pure `fromAgUiMessages`, `reduceAgUiRun`, `answerAgUiInterrupt` and `getAgUiResume` work with any store. Also available as the `ag-ui` shadcn registry item.

## 0.2.0

### Minor Changes

- [#2](https://github.com/dgesteves/agent-ui-kit/pull/2) [`bc48aed`](https://github.com/dgesteves/agent-ui-kit/commit/bc48aeda21fe85f3b033a69741aed61a2c376d59) Thanks [@dgesteves](https://github.com/dgesteves)! - Support AI SDK 6. The `ai` peer range is now `^6.0.0 || ^7.0.102`, and CI runs the typecheck and the full test suite against AI SDK 6.0.0 and the latest 6.x as well as 7. The kit reads the two approval fields AI SDK 7 added (`approval.isAutomatic` for `toolApproval` policy decisions, and `approval.requestReason`) only when they are present, so on AI SDK 6 approvals are always a person's decision and the card falls back to your `description`. Policies, and the "Auto-approved" and "Blocked by policy" labels, remain AI SDK 7 features.
