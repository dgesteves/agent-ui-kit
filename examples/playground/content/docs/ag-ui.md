[AG-UI](https://docs.ag-ui.com) is the open protocol that LangGraph, CrewAI, Mastra, Pydantic AI and other agent frameworks use to stream runs to a frontend. `@dgesteves/agent-ui-kit/ag-ui` turns an AG-UI agent into the same message parts the AI SDK produces, so every component works with it unchanged, approvals included.

Want to see it first? The [components page](/gallery#ag-ui) runs a real `@ag-ui/client` agent replaying a LangGraph-style run, with an interrupt you can approve or deny.

## Install

```package-install
npm i @dgesteves/agent-ui-kit ai @ag-ui/client
```

`ai` is there for the message part types only. A custom agent, an `AbstractAgent` whose `run()` returns an RxJS `Observable`, needs `rxjs` too, at the version `@ag-ui/client` uses (`rxjs@7.8.1` for 1.0). Add the styles as in [Getting started](/docs/getting-started#add-the-styles). With the shadcn CLI, the adapter is the `ag-ui` item:

```package-install
npx shadcn@latest add @agent-ui-kit/ag-ui
```

## Render an agent

`useAgUiAgent` takes any `@ag-ui/client` agent, `HttpAgent` or a framework integration's own `AbstractAgent`, and returns what the components need:

```tsx title="app/agent-run.tsx"
'use client';

import { HttpAgent } from '@ag-ui/client';
import { AgentMessage, AgentStatus, RunMeter, deriveAgentState } from '@dgesteves/agent-ui-kit';
import { useAgUiAgent } from '@dgesteves/agent-ui-kit/ag-ui';

const agent = new HttpAgent({ url: '/api/agent' });

export function AgentRun() {
  const { messages, status, usage, step, respond } = useAgUiAgent(agent);
  const last = messages.findLast((m) => m.role === 'assistant');
  const { state, detail } = deriveAgentState({ status, message: last });
  return (
    <>
      <AgentStatus state={state} detail={step ?? detail} />
      {last ? (
        <AgentMessage
          message={last}
          streaming={status === 'streaming'}
          active={state !== 'done' && state !== 'error'}
          onToolApproval={respond}
        />
      ) : null}
      <RunMeter usage={usage} />
    </>
  );
}

export async function send(text: string) {
  agent.addMessage({ id: crypto.randomUUID(), role: 'user', content: text });
  await agent.runAgent();
}
```

Create the agent once, outside the component or in a `useMemo`: the hook subscribes to the instance it's given.

| Returns      | What it is                                                                  |
| ------------ | --------------------------------------------------------------------------- |
| `messages`   | The conversation as AI SDK `UIMessage`s: pass each to `AgentMessage`        |
| `status`     | `useChat`-style status, for `deriveAgentState` and `AgentStatus`            |
| `error`      | The run's error, if it failed                                               |
| `usage`      | Token usage summed over the runs seen, for `RunMeter`                       |
| `step`       | The step in progress, such as the LangGraph node running                    |
| `interrupts` | Open interrupts; those bound to a tool call show as approval cards          |
| `respond`    | Answers a tool-call interrupt; pass it as `AgentMessage`'s `onToolApproval` |
| `resolve`    | Answers any interrupt with your own payload                                 |
| `stop`       | Aborts the run in progress                                                  |

## How events map

| AG-UI 1.0                                                           | Becomes                                                                                         |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| user message                                                        | `user` message with `text` parts, images and documents as `file` parts                          |
| the assistant, reasoning, tool and activity messages that follow it | one `assistant` message, the way the AI SDK groups a multi-step run                             |
| `TEXT_MESSAGE_*`, `REASONING_*`                                     | `text` and `reasoning` parts, `state: 'streaming'` until their end event                        |
| `TOOL_CALL_START`, `TOOL_CALL_ARGS`                                 | `dynamic-tool` part, `input-streaming`, with the arguments parsed as they arrive                |
| `TOOL_CALL_END`                                                     | `input-available`                                                                               |
| `TOOL_CALL_RESULT`, tool message                                    | `output-available` (JSON results parsed), or `output-error` with the tool message's `error`     |
| `RUN_FINISHED` with an `interrupt` outcome bound to a tool call     | `approval-requested`, the interrupt's `message` as `approval.requestReason`                     |
| `respond({ id, approved, reason })`                                 | `approval-responded` or `output-denied`; the agent resumes with `payload: { approved, reason }` |
| `RUN_STARTED`, content, `RUN_FINISHED`, `RUN_ERROR`                 | `status`: `submitted`, `streaming`, then `ready` or `error`                                     |
| `usage` on `RUN_FINISHED` and `RUN_ERROR`                           | `usage`, summed over runs, with cache and reasoning tokens                                      |
| `STEP_STARTED`                                                      | `step`                                                                                          |
| activity message                                                    | a `data-${activityType}` part, rendered by `renderData`                                         |

Shared state (`STATE_SNAPSHOT`, `STATE_DELTA`) stays on `agent.state`, and a subagent's messages render inline in its parent's timeline.

## Interrupts and approvals

AG-UI resumes every open interrupt in one run, so the hook waits until each has an answer before it calls `runAgent({ resume })`. A tool-call interrupt renders as an approval card, and `respond` answers it with `{ approved, reason }`.

Interrupts that aren't tool approvals (`input_required`, or your own) are in `interrupts`. Answer them with `resolve`, matching the interrupt's `responseSchema`:

```ts
await resolve({ interruptId: interrupt.id, status: 'resolved', payload: { city: 'Lisbon' } });
```

## LangGraph

LangGraph agents speak AG-UI through [`ag-ui-langgraph`](https://github.com/ag-ui-protocol/ag-ui/tree/main/integrations/langgraph/python), which serves a compiled graph from FastAPI:

```python title="server.py"
# pip install ag-ui-langgraph fastapi uvicorn
from fastapi import FastAPI
from ag_ui_langgraph import LangGraphAgent, add_langgraph_fastapi_endpoint

from my_agent import graph  # your compiled graph

app = FastAPI()
# emit_interrupt_outcome reports interrupts on RUN_FINISHED, where useAgUiAgent reads them. It's off by default.
add_langgraph_fastapi_endpoint(app, LangGraphAgent(name="agent", graph=graph, emit_interrupt_outcome=True), "/agent")
```

Point `HttpAgent` at it (`new HttpAgent({ url: 'http://localhost:8000/agent' })`), with FastAPI's `CORSMiddleware` or a rewrite in your app if the origins differ. An interrupt renders as an approval card when its value names the tool call it guards, and the hook resumes it with `{ approved, reason }`:

```python
from langgraph.types import interrupt

answer = interrupt({"message": f"Run `{command}`?", "tool_call_id": tool_call["id"]})
if not answer["approved"]:
    ...  # answer.get("reason") is what the user typed, if anything
```

Interrupts without a tool call are in `interrupts`, for `resolve`.

## Other frameworks

CrewAI, Mastra, Pydantic AI and the protocol's other integrations each serve or wrap an AG-UI agent. Point an `HttpAgent` at the endpoint, or pass the integration's own `AbstractAgent` to `useAgUiAgent`; the components don't change. An interrupt becomes an approval card when it carries the `toolCallId` of the call it guards; how each framework sets that varies, so check its docs if you want approval cards rather than `interrupts`.

## Without the hook

The pure pieces behind it, `fromAgUiMessages`, `reduceAgUiRun`, `answerAgUiInterrupt` and `getAgUiResume`, work with your own store or a recorded event log. The adapter has no dependency on `@ag-ui/*`: it reads their objects structurally, and its tests run a real `@ag-ui/client` agent through an interrupt and a resumed run.
