The [Agent Client Protocol](https://agentclientprotocol.com) (ACP) is the JSON-RPC protocol editors use to run coding agents. `signoff-ui/acp` turns one prompt turn into the parts the components render: the agent's message and thought chunks, its tool calls and their status, each permission request as an approval card with the options the agent offered, and an edit's diff content as `DiffReview` files.

Want to see it first? The [components page](/gallery#acp) plays a scripted ACP turn, no real agent: a read, an edit that shows its diff and asks permission, then the tests, which ask too.

## Install

```package-install
npm i signoff-ui ai
```

`ai` is there for the message part types only. The entry is pure functions with no React and no dependency on an ACP library: its types mirror what it reads, and `@agentclientprotocol/sdk`'s objects fit them as they are (a type test checks it). Add the styles as in [Getting started](/docs/getting-started#add-the-styles).

## Fold a turn

A client receives `session/update` notifications while `session/prompt` runs, and `session/request_permission` requests it has to answer. Fold both into an `AcpTurn`, and render `toAcpMessage(turn)`. This hook holds one turn, and is the client half of the connection:

```tsx title="components/use-acp-turn.tsx"
'use client';

import type { Agent, Client, RequestPermissionResponse } from '@agentclientprotocol/sdk';
import { useRef, useState } from 'react';
import type { ApprovalDecision } from 'signoff-ui';
import {
  answerAcpPermission,
  createAcpTurn,
  endAcpTurn,
  reduceAcpTurn,
  requestAcpPermission,
  toAcpPermissionResponse,
  type AcpTurn,
} from 'signoff-ui/acp';

/** One prompt turn at a time: the client half of the connection, and what the components render. */
export function useAcpTurn() {
  const [turn, setTurn] = useState<AcpTurn>();
  const waiting = useRef(new Map<string, (response: RequestPermissionResponse) => void>());
  // Pass it to the connection: new ClientSideConnection(() => client, stream).
  const [client] = useState<Client>(() => ({
    sessionUpdate: (params) => setTurn((t) => t && reduceAcpTurn(t, params)),
    requestPermission: (params) =>
      new Promise((resolve) => {
        waiting.current.set(params.toolCall.toolCallId, resolve);
        setTurn((t) => t && requestAcpPermission(t, params));
      }),
  }));

  async function prompt(agent: Agent, sessionId: string, text: string) {
    setTurn(createAcpTurn());
    try {
      const response = await agent.prompt({ sessionId, prompt: [{ type: 'text', text }] });
      setTurn((t) => t && endAcpTurn(t, response));
    } catch (error) {
      setTurn((t) => t && endAcpTurn(t, { error: { message: String(error) } }));
    }
  }

  function decide(toolCallId: string, decision: ApprovalDecision) {
    const options = turn?.permissions[toolCallId]?.options ?? [];
    setTurn((t) => t && answerAcpPermission(t, toolCallId, decision));
    waiting.current.get(toolCallId)?.(toAcpPermissionResponse(decision, options));
    waiting.current.delete(toolCallId);
  }

  return { turn, client, prompt, decide };
}
```

The connection itself, `ClientSideConnection` from `@agentclientprotocol/sdk` over the agent's stdio or a bridge, is up to your app: these functions only fold what it receives.

## Render it

`AgentMessage` renders the turn. For a call waiting on its permission request, render an `ApprovalCard` that offers the agent's options, with the diff of an edit as its preview:

```tsx title="components/acp-turn.tsx"
'use client';

import { AgentMessage, ApprovalCard, DiffReview, getApprovalStatus, type ApprovalDecision } from 'signoff-ui';
import { acpToolName, decisionsFromAcpOptions, fromAcpDiffs, toAcpMessage, type AcpTurn } from 'signoff-ui/acp';

export function AcpTurnView({
  turn,
  cwd,
  decide,
}: {
  turn: AcpTurn;
  cwd: string;
  decide: (id: string, d: ApprovalDecision) => void;
}) {
  const active = turn.status === 'submitted' || turn.status === 'streaming';
  return (
    <AgentMessage
      message={toAcpMessage(turn)}
      streaming={turn.status === 'streaming'}
      active={active}
      renderTool={(part) => {
        const permission = turn.permissions[part.toolCallId];
        if (!permission) return undefined;
        const call = turn.toolCalls[part.toolCallId]!;
        const files = fromAcpDiffs(call.content, { root: cwd });
        return (
          <ApprovalCard
            toolName={acpToolName(call)}
            title={call.title ?? undefined}
            input={call.rawInput}
            preview={files.length > 0 ? <DiffReview files={files} readOnly /> : undefined}
            status={getApprovalStatus(part)}
            decision={permission.decision === 'cancelled' ? undefined : permission.decision}
            // The agent's options. It keeps what "always" means, so the card shows no argument patterns.
            ruleScope={false}
            decisions={decisionsFromAcpOptions(permission.options).filter((d) => d !== 'allow-session')}
            onDecide={(choice) => decide(part.toolCallId, choice.decision)}
          />
        );
      }}
    />
  );
}
```

`toAcpPermissionResponse(decision, options)` selects the option of the same kind: `allow-once` is `allow_once`, `allow-always` is `allow_always`, `deny-once` is `reject_once` and `deny-always` is `reject_always`. With no option of that kind, the request is cancelled. `decisionsFromAcpOptions` also offers `allow-session`, which answers `allow_once` and leaves the session rule to your `useApprovalPolicy`; the example above leaves it out.

## How a turn maps

| ACP                                                   | Becomes                                                                                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `agent_message_chunk`, `agent_thought_chunk` (text)   | `text` and `reasoning` parts, consecutive chunks joined, the last one `streaming` until the turn ends          |
| `tool_call`, `tool_call_update`                       | a `dynamic-tool` part per call, updates merged by id (`null` and missing fields keep their value)              |
| the tool's `name`, else `kind`, else `title`          | the part's `toolName`, which approval rules match; `title` is the part's `title`                               |
| `pending`, `in_progress`                              | `input-available`, shown running                                                                               |
| `completed`                                           | `output-available`, the output being `rawOutput`, else the text of its content                                 |
| `failed`                                              | `output-error`, with the text of its content                                                                   |
| `session/request_permission` (`requestAcpPermission`) | `approval-requested`, the tool call id as the approval id                                                      |
| `answerAcpPermission(turn, id, decision)`             | `approval-responded` (then the output, approval kept), or `output-denied`, also when the request was cancelled |
| `session/prompt` returns (`endAcpTurn`)               | `status: 'ready'` and its `stopReason`, or `'error'`: a call left running then reads as stopped                |
| `diff` content (`fromAcpDiffs`)                       | `DiffReview` files, paths relative to `root` (the session's `cwd`), a diff with no `oldText` a new file        |

User message chunks, plans, available commands, mode, config and usage updates are left out of the message. `toAcpDiffs` goes the other way, from files to diff content.

## What it does not do yet

ACP's permission request is all or nothing: the agent offers allow and reject, and nothing in between. So the card above approves or rejects a whole edit, with its diff to read. Accepting some hunks of an edit and rejecting others would mean the client applying the edit itself, through `fs/write_text_file`, which this entry does not do.
