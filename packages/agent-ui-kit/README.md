# @dgesteves/agent-ui-kit

React components for agent-run UX: tool call timelines, human-in-the-loop approvals, per-hunk diff review and run telemetry. Typed against AI SDK v7 `UIMessage` parts.

<img src="https://raw.githubusercontent.com/dgesteves/agent-ui-kit/main/docs/media/hero.png" width="100%" alt="An agent run rendered with agent-ui-kit: a tool call timeline with durations, a failed call with its error inline, a high-risk approval card, and a sidebar with agent status and a run meter.">

```bash
pnpm add @dgesteves/agent-ui-kit ai
```

```css
/* Tailwind CSS v4 */
@import 'tailwindcss';
@import '@dgesteves/agent-ui-kit/tailwind.css';
```

```ts
// Without Tailwind
import '@dgesteves/agent-ui-kit/styles.css';
```

```tsx
import { AgentMessage } from '@dgesteves/agent-ui-kit';

<AgentMessage
  message={lastAssistantMessage}
  streaming={status === 'streaming'}
  onToolApproval={addToolApprovalResponse}
/>;
```

Components: `AgentMessage`, `ToolCallTimeline`, `ApprovalCard` / `ToolApprovalCard`, `DiffReview`, `RunMeter`, `AgentStatus`, `Sources`, `Markdown`, `Reasoning`. Hooks and helpers: `useRunTiming`, `useToolTimings`, `deriveAgentState`, `applyHunks`, `estimateCost`.

Peer dependencies: `react@^19`, `react-dom@^19`, `ai@^7` (the kit imports its types only).

Documentation, the playground, the shadcn registry and design notes: [github.com/dgesteves/agent-ui-kit](https://github.com/dgesteves/agent-ui-kit).

MIT © Diogo Esteves
