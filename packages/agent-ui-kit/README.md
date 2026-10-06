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
'use client';

import { useChat } from '@ai-sdk/react';
import { AgentMessage, deriveAgentState } from '@dgesteves/agent-ui-kit';

export function AgentRun() {
  const { messages, status, addToolApprovalResponse } = useChat();
  const last = messages.findLast((m) => m.role === 'assistant');
  const { state } = deriveAgentState({ status, message: last });
  if (!last) return null;
  return (
    <AgentMessage
      message={last}
      streaming={status === 'streaming'}
      // Once the run has finished, been stopped or failed, tool calls that never settled read "Stopped".
      active={state !== 'done' && state !== 'error'}
      onToolApproval={addToolApprovalResponse}
    />
  );
}
```

Components: `AgentMessage`, `ToolCallTimeline`, `ApprovalCard` / `ToolApprovalCard`, `DiffReview`, `RunMeter`, `AgentStatus`, `Sources`, `Markdown`, `Reasoning`. Hooks and helpers: `useRunTiming`, `useToolTimings`, `deriveAgentState`, `applyHunks`, `estimateCost`, `addUsage`.

Components and hooks carry their own `'use client'` directive (`Sources` needs none). The pure helpers do not, so Server Components and Route Handlers can call them, from the main entry or from `@dgesteves/agent-ui-kit/core` (helpers only, no React).

Peer dependencies: `react@^19`, `react-dom@^19`, `ai@^7.0.102` (the kit imports its types only; 7.0.102 settles tool calls that a `toolApproval` policy denies, which earlier releases can leave reading "Running").

Documentation, the playground, the shadcn registry and design notes: [github.com/dgesteves/agent-ui-kit](https://github.com/dgesteves/agent-ui-kit).

MIT © Diogo Esteves
