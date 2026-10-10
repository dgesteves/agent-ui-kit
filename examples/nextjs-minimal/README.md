# Next.js quickstart

The [README quickstart](../../README.md#quickstart), running: a Next.js 16 app (`cacheComponents` on, as in new apps) with an AI SDK 7 route, against a scripted model, so it needs no API key. One run covers a tool call, a failed tool, an approval, the resumed run, sources and the run meter.

```bash
pnpm install
pnpm dev   # http://localhost:3200
```

Send any message: the scripted model ignores it and plays the same run every time. Approve or deny the command to see both endings.

| File                                             | What it is                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [`app/agent-run.tsx`](app/agent-run.tsx)         | The client: `useChat`, the components and a minimal composer                                                |
| [`app/page.tsx`](app/page.tsx)                   | Renders it in a `<Suspense>` boundary, which `useChat` needs under `cacheComponents`                        |
| [`app/api/chat/route.ts`](app/api/chat/route.ts) | The route: tools, an approval policy, `stopWhen`, usage as message metadata                                 |
| [`lib/mock-model.ts`](lib/mock-model.ts)         | The scripted model (`MockLanguageModelV4` from `ai/test`)                                                   |
| [`app/static/page.tsx`](app/static/page.tsx)     | A finished run rendered from a Server Component. `next build` fails if a component is not safe to prerender |

For a real model, install a provider (`pnpm add @ai-sdk/openai`), set its API key, and replace `mockModel` in the route with `openai('gpt-5.4-mini')`.

In this repository the example builds against the local library (see `overrides` in `pnpm-workspace.yaml`); CI builds it and runs [`scripts/smoke-nextjs-minimal.mjs`](../../scripts/smoke-nextjs-minimal.mjs), which approves the command in Chrome and waits for the final answer. Copied on its own, it installs the latest `signoff-ui` from npm.
