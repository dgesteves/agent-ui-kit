Tokens in and out, estimated cost, time to first token, active run time and prompt-cache hit rate. It takes the AI SDK `LanguageModelUsage` shape directly; to cover a whole run across review and approval round trips, sum it on the server with `addUsage`, as [the quickstart's route](/docs/getting-started#render-a-run) does.

`useRunTiming(status, messages)` measures time to first token and active time per turn: a run starts with each user message and spans its round trips, leaving out the time spent waiting on you. Without `messages`, each request is timed on its own. Time to first token is left unknown, not 0, for a run that was already streaming when the hook first saw it.

`pricing` is in USD per million tokens: `input` and `output`, plus optional `cachedInput` for cache reads and `cacheWrite` for cache writes (1.25× input on Anthropic, for example), which both default to `input`.
