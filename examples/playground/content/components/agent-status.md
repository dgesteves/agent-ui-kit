Thinking, working, waiting for approval, done, stopped or error, with an elapsed timer. Changes are announced through a live region: debounced so quick flips are not read out one by one, and assertive only for approvals and errors.

`deriveAgentState` maps `useChat`'s status and the latest message to a state, with human-in-the-loop waits taking precedence. A run that ended with work unfinished, which is what `stop()` leaves behind (text or reasoning still streaming, a tool call still preparing or running), is `stopped` rather than `done`.

Client-side tools change that. Name the ones that wait on a person, such as a review, in `pendingClientTools`: they read `awaiting-approval`. Name the ones the app runs itself (`onToolCall`, then `addToolOutput`) in `clientTools`: while one runs, `useChat` is `ready`, and the run reads `working` with the tool as its detail.
