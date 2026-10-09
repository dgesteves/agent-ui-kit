# Contributing

Issues and pull requests are welcome. For a larger change, open an issue first, so we can agree on the shape before you write it.

## Setup

Node 24 (see `.nvmrc`) and pnpm (the version in `package.json`'s `packageManager`; `corepack enable` picks it up).

```bash
pnpm install
pnpm dev   # the library in watch mode, and the playground on http://localhost:3100
```

The playground runs a scripted agent and needs no key. For live mode, copy `examples/playground/.env.example` to `.env.local` and set `OPENAI_API_KEY`, and `OPENAI_MODEL` for a model other than `gpt-5.4-mini`. It runs on your key; the public demo has none, so it shows only the scripted run. `examples/nextjs-minimal` is the README quickstart as an app: build the library, then `pnpm --filter nextjs-minimal dev` (port 3200).

```
packages/agent-ui-kit/   the library: src/ (components, lib/, styles/), test/, build scripts
examples/playground/     the playground and the component gallery (Next.js)
examples/nextjs-minimal/ the README quickstart, against a scripted model
registry.json            the shadcn registry, generated from src/
scripts/                 registry generator, smoke tests, media capture, accessibility audit
```

## Checks

CI runs all of these; run the ones your change touches before you push.

```bash
pnpm format:check && pnpm lint && pnpm lint:registry
pnpm build:lib        # also checks 'use client' directives and the shipped CSS
pnpm typecheck
pnpm test             # Vitest, Testing Library and axe in jsdom
pnpm --filter @dgesteves/agent-ui-kit lint:package   # publint and attw
pnpm registry:check   # registry.json matches src/
pnpm smoke:styles     # styles.css in Chrome, next to a global reset and in a Tailwind v3 build
pnpm build:playground && pnpm smoke:playground
pnpm --filter nextjs-minimal build && pnpm smoke:nextjs
```

The smoke tests and `pnpm a11y` drive Google Chrome through Playwright, so they need Chrome installed.

The suite also runs against AI SDK 6 and React 18. To do the same, in `packages/agent-ui-kit` (then restore `package.json` and `pnpm-lock.yaml`):

```bash
pnpm add --save-dev ai@^6 && pnpm exec tsc --noEmit -p tsconfig.src.json && pnpm test
pnpm add --save-dev react@^18.2.0 react-dom@^18.2.0 @types/react@^18 @types/react-dom@^18 && pnpm test
```

## Adding a component

1. Add it under `packages/agent-ui-kit/src/`. Start the file with `'use client'` if it uses hooks, state or event handlers; keep pure helpers in `src/lib/` without it, so Server Components can call them. Style it with Tailwind utilities and the `aui-*` color tokens (no fixed colors, so themes apply), and give its root `data-aui` and a `data-slot`.
2. Export it from `src/index.ts`, and helpers with no React from `src/core.ts` too.
3. Add tests in `packages/agent-ui-kit/test/`, including an axe check. Every render must be safe on the server: no clock or random reads while rendering (`test/server-render.test.tsx`).
4. Add it to `ITEMS` in `scripts/registry.mjs` and run `pnpm registry:generate`, which works out the files and dependencies from its imports.
5. Show it in the gallery (`examples/playground/components/gallery.tsx`) and document it in the README.

## Changesets

A change to the published package needs a changeset: run `pnpm changeset`, pick `@dgesteves/agent-ui-kit`, choose patch for a fix or minor for a feature, and write a line or two for the changelog from a user's point of view. Docs, the examples and CI need none. Merging to `main` opens a "Version packages" pull request, and merging that publishes to npm.

By contributing, you agree that your work is released under the [MIT license](./LICENSE) and that you follow the [code of conduct](./CODE_OF_CONDUCT.md).
