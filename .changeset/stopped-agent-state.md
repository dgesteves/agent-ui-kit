---
'@dgesteves/agent-ui-kit': minor
---

A stopped run no longer reads "Done". `deriveAgentState` returns a new `stopped` state when the run has ended (`ready`) with work unfinished in the message, which is what `stop()` leaves behind: text or reasoning still streaming, or a tool call still preparing, running or with partial output. `AgentStatus` shows it as "Stopped" with a stop glyph, and announces it politely. `AgentMessage` with `active={false}` also ends text and reasoning that were left streaming, so a stopped answer loses its caret and its "Thinking" label.

AG-UI runs end the same way. A `RUN_FINISHED` with a `cancelled` outcome, `useAgUiAgent`'s `stop()`, and `HttpAgent`'s own abort leave what was streaming cut off, so they read as `stopped`. Before, a cancelled run read as finished, and stopping an `HttpAgent` run showed an error ("Aborted"), because `HttpAgent` reports its abort as `RUN_ERROR` with code `abort`.

If you derive `active` as the README did, `active={state !== 'done' && state !== 'error'}`, add `state !== 'stopped'`. Without it, calls a stopped run cut off keep their clocks running. Client-side tools the app is still answering belong in `pendingClientTools`: otherwise a ready run with such a call waiting reads as `stopped`.
