## Requirements

- **React** 18.2 or later, or 19 (`react@^18.2.0 || ^19.0.0`). CI runs the test suite on both.
- **AI SDK** 6 or 7 (`ai@^6.0.0 || ^7.0.102`). The kit imports its types only, so it adds no SDK code to your bundle.
- **A React app.** Nothing in the kit is tied to a framework. The walkthrough below is a Next.js 16 App Router app, which CI builds and runs in Chrome.

For an AG-UI agent (LangGraph, CrewAI, Mastra and the rest) instead of the AI SDK, read this page for the install and the styles, then go to [AG-UI agents](/docs/ag-ui).

## Install

The same components come two ways: as an npm package, or as source files the shadcn CLI copies into your app.

### From npm

```package-install
npm i @dgesteves/agent-ui-kit ai
```

`ai` is a peer dependency, for the message part types. The package ships ES modules with `'use client'` kept per file, a precompiled stylesheet, and `@dgesteves/agent-ui-kit/core` for server code.

### With the shadcn CLI

```package-install
npx shadcn@latest add @agent-ui-kit/agent-message
```

`@agent-ui-kit` is in the [shadcn registry directory](https://ui.shadcn.com/docs/directory), so the CLI finds it and adds it to your `components.json` on first use. Each item brings the component, the helpers it imports, its npm dependencies and the theme tokens, which `shadcn add` writes into your CSS. Files land in `components/agent-ui/`.

The items are `agent-message`, `tool-call-timeline`, `approval-card`, `diff-review`, `run-meter`, `agent-status`, `sources`, `markdown`, `reasoning` and `ag-ui`. Installing a second item skips the shared files it already added. They also install by URL (`https://agent-ui-kit-demo.vercel.app/r/agent-message.json`) or straight from the repository (`dgesteves/agent-ui-kit/agent-message`).

### Which one

| Difference           | npm                                     | shadcn                                      |
| -------------------- | --------------------------------------- | ------------------------------------------- |
| Updates              | `npm update`                            | Run `shadcn add` again and merge your edits |
| Styles               | Tailwind v4, Tailwind v3 or no Tailwind | Tailwind v4, like any current shadcn/ui app |
| Changing a component | `className`, tokens and `data-*` hooks  | Edit the source                             |
| Imports              | `@dgesteves/agent-ui-kit`               | `@/components/agent-ui/...`                 |

Start with npm if you want updates and don't plan to fork the components. Use the registry if you'd rather own the code, or your app already follows the shadcn/ui conventions.

## Add the styles

Once per app. Skip this if you installed with the shadcn CLI, which already wrote the tokens into your CSS.

**Tailwind CSS v4.** Import the kit's entry after Tailwind. It adds the tokens, maps them into your theme and points `@source` at the components, so your build generates only the utilities they use.

```css title="app/globals.css"
@import 'tailwindcss';
@import '@dgesteves/agent-ui-kit/tailwind.css';
```

**Tailwind v3, or no Tailwind.** Import the precompiled stylesheet: only the utilities the kit uses, and no global reset.

```ts title="app/layout.tsx"
import '@dgesteves/agent-ui-kit/styles.css';
```

`styles.css` has no cascade layers, so Tailwind v3 builds accept it and a global reset such as `* { padding: 0 }` can't strip the components' spacing. Every rule is scoped to the components' own elements, so it doesn't restyle your app; import it after your global CSS. If your app orders its CSS with layers, use `styles.layered.css`, the same stylesheet in `@layer theme, base, utilities`.

**Dark mode.** Light is the default. Add `class="dark"` (or `data-theme="dark"`) to `<html>` or any ancestor for the dark palette. To follow the OS setting instead, also import `@dgesteves/agent-ui-kit/theme.auto.css`; `class="light"` on `<html>` still forces light.

## Render a run

A Next.js App Router app with AI SDK 7: a client component, a page and a route. [The quickstart, running](https://github.com/dgesteves/agent-ui-kit/tree/main/examples/nextjs-minimal) is this section as an app against a scripted model, so it needs no API key.

```package-install
npm i @dgesteves/agent-ui-kit ai @ai-sdk/react @ai-sdk/openai zod
```

The client renders the last assistant message, its status and its cost, with a minimal composer. The wrapper paints the kit's own background and text colors (`bg-aui-bg text-aui-fg`), so the run reads well whatever your page's colors are. Without Tailwind, give it `background: var(--aui-bg); color: var(--aui-fg)` instead.

```tsx title="app/agent-run.tsx"
'use client';

import { useChat } from '@ai-sdk/react';
import { lastAssistantMessageIsCompleteWithApprovalResponses, type LanguageModelUsage, type UIMessage } from 'ai';
import { useState } from 'react';
import { AgentMessage, AgentStatus, RunMeter, deriveAgentState, useRunTiming } from '@dgesteves/agent-ui-kit';

type Message = UIMessage<{ usage?: LanguageModelUsage }>;

export function AgentRun() {
  const { messages, status, sendMessage, addToolApprovalResponse } = useChat<Message>({
    // Continue the run as soon as every pending approval has an answer.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const [input, setInput] = useState('');
  const last = messages.findLast((m) => m.role === 'assistant');
  const { state, detail } = deriveAgentState({ status, message: last });
  const timing = useRunTiming(status);

  return (
    <div className="bg-aui-bg text-aui-fg mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <AgentStatus state={state} detail={detail} elapsedMs={timing.activeMs} />
      {last && (
        <AgentMessage
          message={last}
          streaming={status === 'streaming'}
          // Once the run has finished, been stopped or failed, calls that never settled read "Stopped".
          active={state !== 'done' && state !== 'stopped' && state !== 'error'}
          onToolApproval={addToolApprovalResponse}
        />
      )}
      <RunMeter
        usage={last?.metadata?.usage}
        pricing={{ input: 2.5, cachedInput: 0.25, output: 10 }}
        ttftMs={timing.ttftMs}
        durationMs={timing.activeMs}
      />
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!input.trim()) return;
          void sendMessage({ text: input });
          setInput('');
        }}
      >
        <input
          aria-label="Message the agent"
          placeholder="Ask the agent to change something"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="border-aui-border bg-aui-surface flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={status !== 'ready' && status !== 'error'}
          className="bg-aui-accent text-aui-on-accent rounded-lg px-4 text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

Render it from a page. With `cacheComponents`, on by default in new Next.js 16 apps, `useChat` needs a `<Suspense>` boundary: it creates ids with `Math.random()`, which Next.js doesn't allow in prerendered output.

```tsx title="app/page.tsx"
import { Suspense } from 'react';
import { AgentRun } from './agent-run';

export default function Page() {
  return (
    <Suspense>
      <AgentRun />
    </Suspense>
  );
}
```

On the server, give the model tools, ask for approval before the risky one, and send usage as message metadata:

```ts title="app/api/chat/route.ts"
import { openai } from '@ai-sdk/openai';
import { addUsage } from '@dgesteves/agent-ui-kit/core';
import { convertToModelMessages, stepCountIs, streamText, tool, type LanguageModelUsage, type UIMessage } from 'ai';
import { z } from 'zod';

type Message = UIMessage<{ usage?: LanguageModelUsage }>;

// A pretend repository, so nothing touches your disk or shell.
const FILES: Record<string, string> = {
  'app/api/chat/route.ts': 'export async function POST(req: Request) {\n  // ...\n}\n',
};

const tools = {
  read_file: tool({
    description: 'Read a file from the repository.',
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }) => {
      const content = FILES[path];
      if (content === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      return { path, content };
    },
  }),
  run_command: tool({
    description: 'Run a shell command in the repository.',
    inputSchema: z.object({ command: z.string() }),
    execute: async ({ command }) => ({ exitCode: 0, stdout: `(simulated) ${command}` }),
  }),
};

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();
  const result = streamText({
    model: openai('gpt-5.4-mini'),
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    // Ask before running commands. The reason shows on the approval card.
    toolApproval: { run_command: { type: 'user-approval', reason: 'Runs a shell command in the repository.' } },
    // Keep going after tool calls: the AI SDK stops after the first step by default.
    stopWhen: stepCountIs(10),
  });

  // Once approved, the run continues the same message in a new request whose totalUsage starts
  // from zero. Add the usage the message already has (it comes back from the client, so it's fine
  // for display but not for billing).
  const last = messages.at(-1);
  const previous = last?.role === 'assistant' ? last.metadata?.usage : undefined;

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    sendSources: true,
    messageMetadata: ({ part }) =>
      part.type === 'finish' ? { usage: addUsage(previous, part.totalUsage) } : undefined,
    // Failed tool calls show this text. The default hides every error as "An error occurred.".
    onError: (error) => (error instanceof Error ? error.message : 'An error occurred.'),
  });
}
```

What each part is for:

- **`stopWhen`.** The AI SDK stops after one step by default, so without it the run ends at the first tool call and never reaches the approval.
- **`toolApproval`.** The `reason` shows on the approval card, as `approval.requestReason`.
- **`addUsage`.** Without it, the meter would show only the last request of a run that paused for approval.
- **`onError`.** A tool that throws becomes an `output-error` part, and its `errorText` goes through `onError`. By default that hides every message behind "An error occurred.", so the timeline would show that instead of `ENOENT`. In production, pass through the errors you're happy for users to read and keep the rest generic.

## Choosing a model

The kit renders what the AI SDK streams, whichever model produced it, so the model is one line in the route. Install the provider's package, put its API key in your environment, and change `model`:

```ts title="app/api/chat/route.ts"
import { anthropic } from '@ai-sdk/anthropic';

const result = streamText({
  model: anthropic('claude-sonnet-5-5'), // was openai('gpt-5.4-mini')
  messages: await convertToModelMessages(messages, { tools }),
  tools,
  toolApproval: { run_command: { type: 'user-approval', reason: 'Runs a shell command in the repository.' } },
  stopWhen: stepCountIs(10),
});
```

- **OpenAI**: `openai('gpt-5.4-mini')` from `@ai-sdk/openai`, with `OPENAI_API_KEY`
- **Anthropic**: `anthropic('claude-sonnet-5-5')` from `@ai-sdk/anthropic`, with `ANTHROPIC_API_KEY`
- **Google**: `google('gemini-3.5-flash')` from `@ai-sdk/google`, with `GOOGLE_GENERATIVE_AI_API_KEY`
- **xAI**: `xai('grok-4.7')` from `@ai-sdk/xai`, with `XAI_API_KEY`
- **Mistral**: `mistral('mistral-medium-latest')` from `@ai-sdk/mistral`, with `MISTRAL_API_KEY`
- **A local model** (Ollama, LM Studio): `ollama('qwen3')` from `@ai-sdk/openai-compatible`, with no key

A local model runs on your machine, with no key and nothing to pay per token. Point the OpenAI-compatible provider at the local server (LM Studio's is `http://localhost:1234/v1`) and pick a model you've pulled that can call tools:

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const ollama = createOpenAICompatible({ name: 'ollama', baseURL: 'http://localhost:11434/v1' });
```

The model ids are from each package's own model-id types, for the AI SDK 7 versions; any id the provider accepts works. Other providers are on the [AI SDK providers page](https://ai-sdk.dev/providers/ai-sdk-providers), including Amazon Bedrock, Azure OpenAI, Groq, DeepSeek and the Vercel AI Gateway. For tool approvals, pick a model that's good at tool calling.

Agents on LangGraph, CrewAI, Mastra or another AG-UI framework pick their model in the framework, and the components render them the same way: see [AG-UI agents](/docs/ag-ui).

## API keys and costs

**Do I need an API key, and does it work with my ChatGPT or Claude subscription?** The kit itself needs no key: it's React components, and it makes no requests of its own. The agent you build calls your provider with your API key, from your server, like any AI SDK app. Chat subscriptions such as ChatGPT Plus or Claude Pro don't include API access; API usage is billed separately by each provider, or runs free on a local model.

**Does the kit cost anything?** No. It's MIT-licensed, with no service, account or usage fees. What a run costs is what your provider charges for it, which [`RunMeter`](/docs/components/run-meter) estimates from the rates you give it.

**Does the playground use a key?** The public playground runs a scripted agent, with no model and no key. Its optional live mode runs the same tools against OpenAI, with the `OPENAI_API_KEY` (and `OPENAI_MODEL`) of whoever runs the playground; it's off on the public demo.

## AI SDK 6 or 7

The components take the same message parts from both. The differences are on the server:

- Install `ai@^6 @ai-sdk/react@^3 @ai-sdk/openai@^3` for AI SDK 6, and the AI SDK 6 versions of any other providers (`@ai-sdk/anthropic@^3`, `@ai-sdk/google@^3`, `@ai-sdk/xai@^3`, `@ai-sdk/openai-compatible@^2` and so on).
- `toolApproval` is an AI SDK 7 option. On 6, drop it and mark the tool with `needsApproval: true`:

```ts
run_command: tool({
  description: 'Run a shell command in the repository.',
  inputSchema: z.object({ command: z.string() }),
  needsApproval: true,
  execute: async ({ command }) => ({ exitCode: 0, stdout: `(simulated) ${command}` }),
}),
```

The rest of the walkthrough is the same. CI typechecks the library and runs its tests against the latest AI SDK 6 and the oldest supported 6.0.0, as well as 7.

## Next.js

**Server Components.** Components and hooks are client modules with their own `'use client'` directive (except `Sources`, which has no state and renders on the server too), so a Server Component can render any of them. The pure helpers aren't, so Server Components and Route Handlers can call them. Import those from `@dgesteves/agent-ui-kit/core`, which has no React:

```ts title="app/api/review/route.ts"
import { applyHunks, parseFileChange } from '@dgesteves/agent-ui-kit/core';
```

**`cacheComponents`.** Nothing in the kit reads the clock or a random number while rendering on the server, so pages that render it prerender with `cacheComponents` on. Live durations render after hydration, so server and client markup match. `useChat` is the exception, as above: wrap the component that calls it in `<Suspense>`.

**Versions.** CI builds and runs the walkthrough on Next.js 16. Next.js 14 and 15 run React 18.2 and 19, which the kit supports, and the Pages Router works too, since the components are ordinary React; those aren't built in CI.

## React 18 or 19

Both work with the same code. CI installs React 18 and runs the library's test suite, typecheck included, on it. On React 18 there's nothing to change.

## Theming

Every color, radius and font is a CSS variable. Override them on `:root`, on `.dark`, or on any subtree; `.light` and `.dark` switch a subtree's palette too:

```css title="app/globals.css"
:root {
  --aui-accent: #7c3aed; /* fills: buttons, running state, focus */
  --aui-accent-fg: #6d28d9; /* accent text */
  --aui-hot: #c2410c; /* attention: approvals, errors, deletions */
  --aui-radius: 6px;
  --aui-font-sans: var(--font-inter);
}
```

| Tokens                                                                  | Purpose                          |
| ----------------------------------------------------------------------- | -------------------------------- |
| `--aui-bg`, `--aui-surface`, `--aui-surface-2`, `--aui-border(-strong)` | Surfaces and lines               |
| `--aui-fg`, `--aui-fg-muted`, `--aui-fg-subtle`                         | Text, all AA on every surface    |
| `--aui-accent`, `--aui-accent-fg`, `--aui-on-accent`, `--aui-ring`      | Activity, primary actions, focus |
| `--aui-hot`, `--aui-hot-fg`, `--aui-on-hot`, `--aui-warn(-fg)`          | Attention, risk, errors          |
| `--aui-add-bg`, `--aui-add-strong`, `--aui-del-bg`, `--aui-del-strong`  | Diff lines and word highlights   |
| `--aui-chart-input`, `--aui-chart-output`                               | The token bar                    |
| `--aui-code-*`                                                          | Syntax tinting                   |
| `--aui-radius`, `--aui-font-sans`, `--aui-font-mono`                    | Shape and type                   |

The fonts are your app's `--font-sans` and `--font-mono` when it defines them, as shadcn/ui and Tailwind v4 apps do, then Geist when `geist` is loaded, then the system's.

Messages, timelines and sources have no background of their own: they sit on your page and take their text color from the kit's palette. If the page's background doesn't match the kit's theme (a dark page with the light palette, say), give their container `bg-aui-bg text-aui-fg`, as the walkthrough does. Cards, the status pill and the meter paint their own surfaces.

**In a shadcn/ui app**, point the kit at your tokens so it looks native. Add this after the kit's tokens; one block covers both themes, since your tokens switch with `.dark`:

```css title="app/globals.css"
:root,
.dark {
  --aui-bg: var(--background);
  --aui-surface: var(--card);
  --aui-surface-2: var(--muted);
  --aui-border: var(--border);
  --aui-border-strong: var(--input);
  --aui-fg: var(--foreground);
  --aui-fg-muted: var(--muted-foreground);
  --aui-fg-subtle: var(--muted-foreground);
  --aui-accent: var(--primary);
  --aui-accent-fg: var(--primary);
  --aui-on-accent: var(--primary-foreground);
  --aui-ring: var(--ring);
  --aui-hot: var(--destructive);
  --aui-hot-fg: var(--destructive);
  --aui-radius: var(--radius);
}
```

Diff and chart colors keep the kit's cyan and magenta, which your palette may not tell apart as well. The kit's contrast test covers its own palette, so check text contrast with yours.

**Styling hooks.** Components accept `className`, merged with `tailwind-merge`, and expose `data-slot` (such as `data-slot="approval-card"`) and state attributes (`data-phase`, `data-state`, `data-decision`, `data-risk`) to target from your CSS:

```css
[data-slot='approval-card'][data-risk='critical'] {
  outline: 2px solid var(--aui-hot);
}
```

## Next steps

- [AG-UI agents](/docs/ag-ui): render LangGraph, CrewAI or Mastra agents with the same components.
- [Components](/gallery): each component in isolation, with its install command and usage.
- [The playground](/): a full run with approvals and diff review, driven from the keyboard.
