# assistant-ui

An assistant-ui thread that reviews and approves through `signoff-ui/assistant-ui`: a Vite app on assistant-ui's local runtime, with a scripted model in the page, so it needs no API key and no server. The agent proposes an edit to two files, which you review in `DiffReview`; the review goes back as the tool call's result. Then it asks to install two packages, which you approve or deny on the approval card.

```bash
pnpm install
pnpm dev   # http://localhost:3300
```

Send any message: the scripted model ignores it and plays the same run every time. Approve the install "For this session" and send another message: the session rule answers the second install without asking.

| File                                     | What it is                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`src/app.tsx`](src/app.tsx)             | The thread: `useLocalRuntime`, `signoffTools()` in `MessagePrimitive.Parts`, `SignoffToolsProvider` |
| [`src/mock-model.ts`](src/mock-model.ts) | The scripted model: a `ChatModelAdapter` that proposes the edit, asks for approval, then answers    |
| [`src/styles.css`](src/styles.css)       | The thread's layout. The kit's components bring their own styles (`signoff-ui/styles.css`)          |

For the AI SDK runtime instead, see [Inside your chat UI](https://agent-ui-kit-demo.vercel.app/docs/chat-ui#assistant-ui).

In this repository the example builds against the local library (see `overrides` in `pnpm-workspace.yaml`). CI runs [`scripts/smoke-assistant-ui.mjs`](../../scripts/smoke-assistant-ui.mjs), which builds it against the packed package (`npm pack`) and drives a review, an approval and the session rule's answer in Chrome. Copied on its own, it installs the latest `signoff-ui` from npm: `signoff-ui/assistant-ui` ships in the first release after 0.5.0.
