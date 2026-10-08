---
'@dgesteves/agent-ui-kit': minor
---

Render AG-UI agents (LangGraph, CrewAI, Mastra, Pydantic AI and other AG-UI integrations) with the same components. `useAgUiAgent(agent)` from the new `@dgesteves/agent-ui-kit/ag-ui` entry takes an `@ag-ui/client` agent and returns its messages as AI SDK parts, plus `status`, `usage`, `step` and open `interrupts`. Tool-call interrupts become approval cards: pass `respond` as `AgentMessage`'s `onToolApproval`, and the run resumes once every open interrupt has an answer. The pure `fromAgUiMessages`, `reduceAgUiRun`, `answerAgUiInterrupt` and `getAgUiResume` work with any store. Also available as the `ag-ui` shadcn registry item.
