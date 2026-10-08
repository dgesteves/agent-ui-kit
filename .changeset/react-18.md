---
'@dgesteves/agent-ui-kit': minor
---

Support React 18.2 and later: the peer range is now `^18.2.0 || ^19.0.0` for `react` and `react-dom`. `Markdown`, and with it `AgentMessage` and `Reasoning`, rendered its image policy through React 19's `<Context value>`, which crashed on React 18; it now uses `<Context.Provider>`. CI runs the typecheck and the test suite on React 18 too.
