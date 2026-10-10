---
'@dgesteves/agent-ui-kit': minor
---

`useRunTiming` times each turn on its own. Pass the chat's messages, `useRunTiming(status, messages)`: a run then starts with each user message (or a regenerated reply) and spans its approval round trips. Without them, a run now starts with each request submitted after the last one ended. Before, every turn was added to the first: the second turn of a chat showed the first turn's time to first token and the sum of both turns' active time. Time to first token is also no longer 0 by mistake: for a run that was already streaming when the hook first saw it (keyed by a counter that changed while a stopped run was still settling, for example) it is unknown, and so, given the messages, for a request stopped before any reply arrived. The README quickstart now passes `messages`.
