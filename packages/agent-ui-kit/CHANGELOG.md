# @dgesteves/agent-ui-kit

## 0.4.0

### Minor Changes

- [#8](https://github.com/dgesteves/agent-ui-kit/pull/8) [`a83059d`](https://github.com/dgesteves/agent-ui-kit/commit/a83059d2416cfba5f61e3f705010456708d883f9) Thanks [@dgesteves](https://github.com/dgesteves)! - Follow the OS color scheme with `@dgesteves/agent-ui-kit/theme.auto.css`, imported after `styles.css`, `tailwind.css` or `theme.css`: the dark palette applies while the OS is in dark mode, unless `.light` or `data-theme="light"` is on `<html>`. `.light` now switches a subtree back to the light palette, as `data-theme="light"` did. The components also use the app's own `--font-sans` and `--font-mono` when it defines them, as shadcn/ui and Tailwind v4 apps do, before falling back to Geist and the system fonts.

- [#8](https://github.com/dgesteves/agent-ui-kit/pull/8) [`dee0c9f`](https://github.com/dgesteves/agent-ui-kit/commit/dee0c9fdf7d8cd5670697f962e25298590f11490) Thanks [@dgesteves](https://github.com/dgesteves)! - Support React 18.2 and later: the peer range is now `^18.2.0 || ^19.0.0` for `react` and `react-dom`. `Markdown`, and with it `AgentMessage` and `Reasoning`, rendered its image policy through React 19's `<Context value>`, which crashed on React 18; it now uses `<Context.Provider>`. CI runs the typecheck and the test suite on React 18 too.

### Patch Changes

- [#9](https://github.com/dgesteves/agent-ui-kit/pull/9) [`d331de8`](https://github.com/dgesteves/agent-ui-kit/commit/d331de8915c074a02f647c90565bdb750dfa696e) Thanks [@dgesteves](https://github.com/dgesteves)! - The package description and README now say what the kit works with, AI SDK 6 & 7 and AG-UI, instead of "typed against AI SDK v7", and the npm homepage links to the live playground.

- [#8](https://github.com/dgesteves/agent-ui-kit/pull/8) [`ee98aef`](https://github.com/dgesteves/agent-ui-kit/commit/ee98aef383dd2947f4b9056a65cec519459fca48) Thanks [@dgesteves](https://github.com/dgesteves)! - The type declarations no longer end in `sourceMappingURL` comments pointing to `.d.ts.map` files that the package does not ship.

- [#7](https://github.com/dgesteves/agent-ui-kit/pull/7) [`7bd4242`](https://github.com/dgesteves/agent-ui-kit/commit/7bd424288fc2b140019802b1f877a78371fc7fc4) Thanks [@dgesteves](https://github.com/dgesteves)! - Pages that render the components now build with Next.js 16 `cacheComponents`, the default in new apps. `AgentStatus`, `ToolCallTimeline`, `AgentMessage` and `useRunTiming` no longer read the clock while rendering on the server, and `DiffReview` and `parseFileChange` keep jsdiff from reading it, so `next build` no longer fails with "Next.js encountered the unstable value `Date.now()`".

- [#8](https://github.com/dgesteves/agent-ui-kit/pull/8) [`427dd06`](https://github.com/dgesteves/agent-ui-kit/commit/427dd06e439cbd251e906a8e1c73f171bcc27132) Thanks [@dgesteves](https://github.com/dgesteves)! - Depend on `@radix-ui/react-collapsible` and `@radix-ui/react-toggle-group`, the two Radix primitives the components use, instead of the `radix-ui` package, which installed about 60 Radix packages (18 now). The shadcn registry items list the same two packages.

- [#8](https://github.com/dgesteves/agent-ui-kit/pull/8) [`9078703`](https://github.com/dgesteves/agent-ui-kit/commit/9078703647db7ebbff4de6d4c1a3e34f451989f5) Thanks [@dgesteves](https://github.com/dgesteves)! - The shadcn registry items lint clean under a new Next.js app's ESLint config, so apps that run `next lint`/`eslint --max-warnings=0` pass after `shadcn add`: no unused `_node` bindings in `markdown.tsx`, no `jsx-a11y` disable comments that such configs report as unused, and no `@next/next/no-img-element` warnings for the images in messages.

- [#8](https://github.com/dgesteves/agent-ui-kit/pull/8) [`5fe8f6e`](https://github.com/dgesteves/agent-ui-kit/commit/5fe8f6e757387f41b8dae59ac49103913106e889) Thanks [@dgesteves](https://github.com/dgesteves)! - `styles.css` works in Tailwind v3 apps and next to global resets. It no longer wraps its rules in `@layer`, which Tailwind v3 builds rejected ("`@layer base` is used but no matching `@tailwind base` directive is present") and which let any unlayered reset, such as create-next-app's `* { padding: 0; margin: 0 }`, strip the components' spacing. Its rules, Tailwind's theme variables included, now apply only to the kit's own elements, so it cannot restyle the app or override the app's Tailwind theme. The layered stylesheet is still available as `styles.layered.css`, and the components' line height no longer depends on the page's.

## 0.3.0

### Minor Changes

- [#5](https://github.com/dgesteves/agent-ui-kit/pull/5) [`28c9b64`](https://github.com/dgesteves/agent-ui-kit/commit/28c9b64e278ede6bda742443a28368bec901dd45) Thanks [@dgesteves](https://github.com/dgesteves)! - Render AG-UI agents (LangGraph, CrewAI, Mastra, Pydantic AI and other AG-UI integrations) with the same components. `useAgUiAgent(agent)` from the new `@dgesteves/agent-ui-kit/ag-ui` entry takes an `@ag-ui/client` agent and returns its messages as AI SDK parts, plus `status`, `usage`, `step` and open `interrupts`. Tool-call interrupts become approval cards: pass `respond` as `AgentMessage`'s `onToolApproval`, and the run resumes once every open interrupt has an answer. The pure `fromAgUiMessages`, `reduceAgUiRun`, `answerAgUiInterrupt` and `getAgUiResume` work with any store. Also available as the `ag-ui` shadcn registry item.

## 0.2.0

### Minor Changes

- [#2](https://github.com/dgesteves/agent-ui-kit/pull/2) [`bc48aed`](https://github.com/dgesteves/agent-ui-kit/commit/bc48aeda21fe85f3b033a69741aed61a2c376d59) Thanks [@dgesteves](https://github.com/dgesteves)! - Support AI SDK 6. The `ai` peer range is now `^6.0.0 || ^7.0.102`, and CI runs the typecheck and the full test suite against AI SDK 6.0.0 and the latest 6.x as well as 7. The kit reads the two approval fields AI SDK 7 added (`approval.isAutomatic` for `toolApproval` policy decisions, and `approval.requestReason`) only when they are present, so on AI SDK 6 approvals are always a person's decision and the card falls back to your `description`. Policies, and the "Auto-approved" and "Blocked by policy" labels, remain AI SDK 7 features.
