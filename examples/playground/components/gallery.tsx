'use client';

import {
  AgentMessage,
  AgentStatus,
  ApprovalCard,
  DiffReview,
  RunMeter,
  Sources,
  ToolCallTimeline,
  type ToolPart,
} from '@dgesteves/agent-ui-kit';
import type { UIMessage } from 'ai';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { PRICING, RATELIMIT_UPSTASH, ROUTE_NEW, ROUTE_OLD, WEB_RESULTS } from '@/lib/scenario';
import { toolMeta } from '@/lib/tools';
import dynamic from 'next/dynamic';
import { Install, type InstallProps } from './install';

// Loaded on the client only: it brings @ag-ui/client, which the rest of the page doesn't need.
const AgUiDemo = dynamic(() => import('./ag-ui-demo'), { ssr: false });

const now = Date.now();

const timelineParts = [
  {
    type: 'tool-search_code',
    toolCallId: 'g1',
    state: 'output-available',
    input: { query: 'api/chat route handler' },
    output: { matches: [{ path: 'app/api/chat/route.ts', line: 14 }] },
  },
  {
    type: 'tool-read_file',
    toolCallId: 'g2',
    state: 'output-error',
    input: { path: 'middleware.ts' },
    errorText: "ENOENT: no such file or directory, open 'middleware.ts'",
  },
  {
    type: 'tool-read_file',
    toolCallId: 'g3',
    state: 'output-available',
    input: { path: 'lib/redis.ts' },
    output: {
      path: 'lib/redis.ts',
      content: "import { Redis } from '@upstash/redis';\n\nexport const redis = Redis.fromEnv();\n",
    },
  },
  {
    type: 'tool-web_search',
    toolCallId: 'g4',
    state: 'input-available',
    input: { query: 'upstash ratelimit sliding window' },
  },
  {
    type: 'tool-run_command',
    toolCallId: 'g5',
    state: 'approval-requested',
    input: { command: 'pnpm add @upstash/ratelimit' },
    approval: { id: 'a5' },
  },
] as unknown as ToolPart[];

const timelineTimings = {
  g1: { startedAt: now - 4_200, runningAt: now - 4_000, endedAt: now - 3_280 },
  g2: { startedAt: now - 3_100, runningAt: now - 3_000, endedAt: now - 2_760 },
  g3: { startedAt: now - 3_050, runningAt: now - 2_950, endedAt: now - 2_500 },
  g4: { startedAt: now - 2_300, runningAt: now - 2_100 },
  g5: { startedAt: now - 600 },
};

const sources = WEB_RESULTS.map((r, i) => ({
  type: 'source-url' as const,
  sourceId: `s${i}`,
  url: r.url,
  title: r.title,
}));

const message: UIMessage = {
  id: 'gallery-msg',
  role: 'assistant',
  parts: [
    {
      type: 'reasoning',
      text: 'The limit has to be checked before `streamText` starts, otherwise a 429 cannot be returned once the stream is open.',
      state: 'done',
    },
    { type: 'text', text: 'I’ll check the route handler and confirm the limiter API first.', state: 'done' },
    {
      type: 'tool-read_file',
      toolCallId: 'm1',
      state: 'output-available',
      input: { path: 'app/api/chat/route.ts' },
      output: { path: 'app/api/chat/route.ts', content: ROUTE_OLD },
    },
    {
      type: 'tool-web_search',
      toolCallId: 'm2',
      state: 'output-available',
      input: { query: 'upstash ratelimit sliding window' },
      output: { results: WEB_RESULTS.slice(0, 2) },
    },
    {
      type: 'text',
      text: 'A **sliding window** smooths bursts better than a fixed window [1], and the check belongs at the top of the handler [3].',
      state: 'done',
    },
    ...sources,
  ],
};

type Theme = 'dark' | 'light';

/** Which palette the component frames use. The tokens switch with a `.dark` or `.light` ancestor. */
function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Component theme"
      className="border-line bg-raised/60 flex rounded-lg border p-0.5"
    >
      {(['dark', 'light'] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => onChange(t)}
          className="focus-visible:outline-cyan-soft cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-[#a1a9b4] capitalize transition-colors hover:text-[#e8eaed] focus-visible:outline-2 focus-visible:outline-offset-1 aria-checked:bg-[#262b33] aria-checked:text-[#e8eaed]"
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function Section({
  id,
  title,
  heading = `<${title} />`,
  description,
  install,
  theme,
  children,
}: {
  id: string;
  title: string;
  /** Defaults to the component as a tag. */
  heading?: string;
  description: string;
  /** The registry item, what to import and a minimal usage, for the install panel. */
  install?: InstallProps;
  theme: Theme;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <div className="mb-3">
        <h2 id={`${id}-title`} className="font-mono text-sm font-semibold text-[#e8eaed]">
          {heading}
        </h2>
        <p className="mt-1 max-w-2xl text-[13px] text-[#a1a9b4]">{description}</p>
      </div>
      {/* The frame takes the chosen palette; the page around it stays dark. */}
      <div data-shot={id} className={`${theme} border-aui-border bg-aui-bg rounded-2xl border p-5 sm:p-6`}>
        {children}
      </div>
      {install ? <Install {...install} /> : null}
    </section>
  );
}

export function Gallery() {
  const [approval, setApproval] = useState<'pending' | 'approved' | 'denied'>('pending');
  const [theme, setTheme] = useState<Theme>('dark');
  // ?theme=light opens the gallery on the light palette, for screenshots.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('theme') !== 'light') return;
    const id = setTimeout(() => setTheme('light'), 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-14 px-4 pt-10 pb-24 sm:px-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-[#e8eaed]">Components</h1>
          <ThemeToggle theme={theme} onChange={setTheme} />
        </div>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#a1a9b4]">
          Each component in isolation, rendered from AI SDK 6 and 7 message parts (or an AG-UI agent, at the end), with
          how to install it from npm or as a shadcn registry item. Everything here is interactive and keyboard
          accessible.
        </p>
      </div>

      <Section
        theme={theme}
        id="agent-status"
        install={{
          item: 'agent-status',
          name: 'AgentStatus, deriveAgentState',
          usage:
            'const { state, detail } = deriveAgentState({ status, message: last });\n\n<AgentStatus state={state} detail={detail} />',
        }}
        title="AgentStatus"
        description="Run state in one pill, announced through a live region."
      >
        <div className="flex flex-wrap gap-3">
          <AgentStatus state="thinking" announce={false} />
          <AgentStatus state="working" detail="read_file" elapsedMs={3_420} announce={false} />
          <AgentStatus state="awaiting-approval" detail="run_command" announce={false} />
          <AgentStatus state="done" elapsedMs={21_800} announce={false} />
          <AgentStatus state="error" label="Rate limited by provider" announce={false} />
        </div>
      </Section>

      <Section
        theme={theme}
        id="tool-call-timeline"
        install={{
          item: 'tool-call-timeline',
          name: 'ToolCallTimeline',
          usage:
            "<ToolCallTimeline\n  parts={message.parts}\n  tools={{ run_command: { label: 'Run command', risk: 'high' } }}\n/>",
        }}
        title="ToolCallTimeline"
        description="Every tool state with durations, a waterfall, and expandable input and output."
      >
        <ToolCallTimeline parts={timelineParts} tools={toolMeta} timings={timelineTimings} />
      </Section>

      <Section
        theme={theme}
        id="approval-card"
        install={{
          item: 'approval-card',
          name: 'ToolApprovalCard',
          usage: '<ToolApprovalCard part={part} onRespond={addToolApprovalResponse} risk="high" />',
        }}
        title="ApprovalCard"
        description="Human-in-the-loop approval with risk, preview and Y / N shortcuts."
      >
        <div className="max-w-2xl">
          <ApprovalCard
            toolName="run_command"
            title="Run command"
            description="Installs a package from the npm registry and updates package.json and pnpm-lock.yaml."
            input={{ command: 'pnpm add @upstash/ratelimit', cwd: '~/acme/chat-app' }}
            risk="high"
            status={approval}
            onApprove={() => setApproval('approved')}
            onDeny={() => setApproval('denied')}
          />
          {approval !== 'pending' && (
            <button
              type="button"
              onClick={() => setApproval('pending')}
              className="text-aui-fg-muted hover:text-aui-fg mt-3 cursor-pointer text-xs underline underline-offset-2"
            >
              Reset
            </button>
          )}
        </div>
      </Section>

      <Section
        theme={theme}
        id="diff-review"
        install={{
          item: 'diff-review',
          name: 'DiffReview',
          usage:
            "<DiffReview\n  files={[{ path: 'app/api/chat/route.ts', oldContent, newContent }]}\n  onSubmit={(result) => addToolOutput({ tool: 'review_changes', toolCallId, output: result })}\n/>",
        }}
        title="DiffReview"
        description="Accept or reject agent edits hunk by hunk, unified or split."
      >
        <DiffReview
          files={[
            { path: 'lib/ratelimit.ts', oldContent: '', newContent: RATELIMIT_UPSTASH },
            { path: 'app/api/chat/route.ts', oldContent: ROUTE_OLD, newContent: ROUTE_NEW },
          ]}
          defaultDecisions={{ 'lib/ratelimit.ts:0': 'accepted', 'app/api/chat/route.ts:2': 'rejected' }}
          onSubmit={() => {}}
        />
      </Section>

      <Section
        theme={theme}
        id="run-meter"
        install={{
          item: 'run-meter',
          name: 'RunMeter',
          usage:
            '<RunMeter\n  usage={last?.metadata?.usage}\n  pricing={{ input: 2.5, cachedInput: 0.25, output: 10 }}\n/>',
        }}
        title="RunMeter"
        description="Tokens, estimated cost and latency; compact for headers, expanded for panels."
      >
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,22rem)_1fr]">
          <figure>
            <figcaption className="text-aui-fg-subtle mb-2 font-mono text-[11px]">
              variant=&quot;expanded&quot;
            </figcaption>
            <RunMeter
              variant="expanded"
              usage={{
                inputTokens: 38_660,
                outputTokens: 2_412,
                inputTokenDetails: { cacheReadTokens: 28_800 },
                outputTokenDetails: { reasoningTokens: 96 },
              }}
              pricing={PRICING}
              ttftMs={684}
              durationMs={21_800}
              model="mock-agent-1"
            />
          </figure>
          <figure>
            <figcaption className="text-aui-fg-subtle mb-2 font-mono text-[11px]">
              variant=&quot;compact&quot;
            </figcaption>
            <RunMeter
              usage={{ inputTokens: 38_660, outputTokens: 2_412, inputTokenDetails: { cacheReadTokens: 28_800 } }}
              pricing={PRICING}
              ttftMs={684}
              durationMs={21_800}
            />
            <p className="text-aui-fg-muted mt-4 max-w-sm text-[13px] leading-relaxed">
              Pass <code className="text-aui-fg font-mono text-[12px]">totalUsage</code> from{' '}
              <code className="text-aui-fg font-mono text-[12px]">streamText</code> through message metadata, and timing
              from <code className="text-aui-fg font-mono text-[12px]">useRunTiming(status)</code>. Cost is an estimate
              from the pricing you supply.
            </p>
          </figure>
        </div>
      </Section>

      <Section
        theme={theme}
        id="sources"
        install={{
          item: 'sources',
          name: 'Sources, getSourceParts',
          usage: '<Sources sources={getSourceParts(message.parts)} variant="cards" />',
        }}
        title="Sources"
        description="Citations as compact chips or cards; inline [n] markers link to them."
      >
        <div className="flex flex-col gap-6">
          <Sources sources={sources} idPrefix="chips" />
          <Sources sources={sources} variant="cards" idPrefix="cards" />
        </div>
      </Section>

      <Section
        theme={theme}
        id="theming"
        title="Theming"
        description="Every color, radius and font is a CSS variable. Light is the default, .dark switches, and any subtree can override tokens."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ['Dark', { className: 'dark bg-[#0d0f12]' }],
              ['Light', { 'data-theme': 'light', className: 'bg-white' }],
              [
                'Custom tokens',
                {
                  className: 'dark bg-[#0f1210]',
                  style: {
                    '--aui-accent': '#a3e635',
                    '--aui-accent-fg': '#bef264',
                    '--aui-ring': '#bef264',
                    '--aui-hot': '#fb923c',
                    '--aui-hot-fg': '#fdba74',
                    '--aui-radius': '4px',
                  } as CSSProperties,
                },
              ],
            ] as const
          ).map(([name, props]) => (
            <figure key={name} {...props} className={`${props.className} rounded-xl border border-[#262b33] p-4`}>
              <figcaption className="text-aui-fg-subtle mb-3 font-mono text-[11px]">{name}</figcaption>
              <div className="flex flex-col gap-3">
                <AgentStatus state="awaiting-approval" detail="run_command" announce={false} size="sm" />
                <ToolCallTimeline
                  parts={timelineParts.slice(0, 3)}
                  tools={toolMeta}
                  timings={timelineTimings}
                  waterfall={false}
                  announce={false}
                />
              </div>
            </figure>
          ))}
        </div>
      </Section>

      <Section
        theme={theme}
        id="agent-message"
        install={{
          item: 'agent-message',
          name: 'AgentMessage',
          usage:
            "<AgentMessage\n  message={last}\n  streaming={status === 'streaming'}\n  onToolApproval={addToolApprovalResponse}\n/>",
        }}
        title="AgentMessage"
        description="A whole assistant UIMessage: reasoning, streaming markdown, grouped tool calls and sources."
      >
        <AgentMessage message={message} tools={toolMeta} />
      </Section>

      <Section
        theme={theme}
        id="ag-ui"
        title="useAgUiAgent"
        heading="useAgUiAgent(agent)"
        install={{
          item: 'ag-ui',
          name: 'useAgUiAgent',
          from: { npm: '@dgesteves/agent-ui-kit/ag-ui', shadcn: 'use-ag-ui-agent' },
          packages: ['@ag-ui/client'],
          usage:
            "const agent = new HttpAgent({ url: '/api/agent' });\nconst { messages, status, usage, respond } = useAgUiAgent(agent);\n\n<AgentMessage message={last} onToolApproval={respond} />",
        }}
        description="AG-UI agents (LangGraph, CrewAI, Mastra, Pydantic AI) through the same components. This one is a real @ag-ui/client agent replaying a LangGraph-style run: steps, streamed tool arguments, and an interrupt that resumes the run when you answer it."
      >
        <AgUiDemo />
      </Section>
    </main>
  );
}
