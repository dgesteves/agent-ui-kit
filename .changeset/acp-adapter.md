---
'signoff-ui': minor
---

`signoff-ui/acp`: render Agent Client Protocol sessions with the components. Pure functions, no React, nothing new to install.

- **A prompt turn as a message.** `createAcpTurn()`, then `reduceAcpTurn(turn, notification)` for each `session/update`: message and thought chunks become text and reasoning, and tool calls and their updates merge by id. `requestAcpPermission(turn, request)` marks a call as waiting on its `session/request_permission`, `answerAcpPermission(turn, toolCallId, decision)` records the answer, and `endAcpTurn(turn, response)` ends the turn with its `stopReason` (or an error). `toAcpMessage(turn)` is the assistant `UIMessage` for `AgentMessage` and `ToolCallTimeline`: a call waiting on a person is `approval-requested`, its tool call id the approval id, and a denied or cancelled one is `output-denied`.
- **Diffs as review files.** `fromAcpDiffs(content, { root })` maps a tool call's `{ type: 'diff', path, oldText, newText }` content to `DiffReview` files, relative to the session's `cwd`. `toAcpDiffs` goes back.
- **The permission converters** (`decisionsFromAcpOptions`, `toAcpPermissionResponse`, `fromAcpPermissionResponse`, `fromAcpPermissionRequest`) are re-exported here. `fromAcpPermissionRequest` now names the tool by ACP 1.8's `name` when the agent sends one, then by `kind` and `title` as before (`acpToolName`). Rules saved against a call's kind (`execute`) no longer match when the agent sends a name (`Bash`): those calls are asked about again, and a `deny-always` rule on the kind needs a rule on the name added to keep blocking them.

- **`ApprovalCard`'s `ruleScope={false}`** hides the argument patterns a session or always decision would cover, for when the agent keeps what "always" means, as ACP's `allow_always` does. The decision then comes without `args`.

The types mirror what is read, and a type test checks that `@agentclientprotocol/sdk` 1.8's notifications, permission requests and diff content fit them, and that the responses fit the SDK's. The components page has a demo with a scripted ACP agent.
