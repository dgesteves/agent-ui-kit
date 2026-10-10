---
'signoff-ui': minor
---

A stopped run no longer reads "Done". `deriveAgentState` returns a new `stopped` state when the run has ended (`ready`) with work unfinished in the message, which is what `stop()` leaves behind: text or reasoning still streaming, or a tool call still preparing, running or with partial output. `AgentStatus` shows it as "Stopped" with a stop glyph, and announces it politely. `AgentMessage` with `active={false}` also ends text and reasoning that were left streaming, so a stopped answer loses its caret and its "Thinking" label.

AG-UI runs end the same way. A `RUN_FINISHED` with a `cancelled` outcome, `useAgUiAgent`'s `stop()`, and `HttpAgent`'s own abort leave what was streaming cut off, so they read as `stopped`. Before, a cancelled run read as finished, and stopping an `HttpAgent` run showed an error ("Aborted"), because `HttpAgent` reports its abort as `RUN_ERROR` with code `abort`.

If you derive `active` as the README did, `active={state !== 'done' && state !== 'error'}`, add `state !== 'stopped'`. Without it, calls a stopped run cut off keep their clocks running. Client-side tools the app runs itself (`onToolCall`, then `addToolOutput` and `sendAutomaticallyWhen`) go in the new `clientTools` option. `useChat` is `ready` while one runs, and the call is `input-available`: with its name in `clientTools`, the run reads `working` with the tool as its detail, instead of flashing `stopped` until the output lands. `pendingClientTools` is unchanged; it is for client-side tools that wait on a person, which read `awaiting-approval`.
