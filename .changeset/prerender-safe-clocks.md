---
'@dgesteves/agent-ui-kit': patch
---

Pages that render the components now build with Next.js 16 `cacheComponents`, the default in new apps. `AgentStatus`, `ToolCallTimeline`, `AgentMessage` and `useRunTiming` no longer read the clock while rendering on the server, and `DiffReview` and `parseFileChange` keep jsdiff from reading it, so `next build` no longer fails with "Next.js encountered the unstable value `Date.now()`".
