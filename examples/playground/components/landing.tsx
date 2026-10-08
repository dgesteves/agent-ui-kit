import type { ReactNode } from 'react';
import { GITHUB_URL } from '@/lib/site';
import { CallsToAction } from './hero';
import { ArrowRightIcon, ArrowUpRightIcon } from './icons';

/*
 * The sections after the live run: what's in the kit, what it works with, how it compares, and
 * how to start. Server-rendered; the only client code is the copy button.
 */

const KIT: Array<{ name: string; id: string; description: ReactNode; meta: string }> = [
  {
    name: 'AgentMessage',
    id: 'agent-message',
    description:
      'A whole assistant message: reasoning, streaming markdown, tool calls grouped into a timeline, approvals inline and sources.',
    meta: 'useChat parts, as they are',
  },
  {
    name: 'ToolCallTimeline',
    id: 'tool-call-timeline',
    description:
      'Every tool call with its state, duration and a waterfall. Errors show inline; input and output on demand.',
    meta: '↑ ↓ between calls',
  },
  {
    name: 'ApprovalCard',
    id: 'approval-card',
    description: 'Human-in-the-loop approval: exactly what will run, how risky it is, and deny with a reason.',
    meta: 'Y approve · N deny',
  },
  {
    name: 'DiffReview',
    id: 'diff-review',
    description:
      'Accept or reject an agent’s edits hunk by hunk, across files. Returns each file with only the accepted hunks applied.',
    meta: 'J K move · A R decide',
  },
  {
    name: 'RunMeter',
    id: 'run-meter',
    description: 'Tokens, estimated cost from your rates, time to first token and the prompt-cache hit rate.',
    meta: 'compact or expanded',
  },
  {
    name: 'AgentStatus',
    id: 'agent-status',
    description: 'The run’s state in one pill, with the tool that’s running and the time spent working.',
    meta: 'announced to screen readers',
  },
  {
    name: 'Sources',
    id: 'sources',
    description: 'Citations as chips or cards, with inline [n] markers in the answer that link to them.',
    meta: 'renders on the server too',
  },
  {
    name: 'useAgUiAgent',
    id: 'ag-ui',
    description:
      'Runs any AG-UI agent and hands the same components its messages, status and usage. Interrupts become approvals.',
    meta: '@dgesteves/agent-ui-kit/ag-ui',
  },
];

const WORKS_WITH: Array<{ title: string; body: ReactNode; code: string }> = [
  {
    title: 'AI SDK 6 & 7',
    body: (
      <>
        Hand it the last assistant message from <Code>useChat</Code>. Tool parts, approvals, sources and usage metadata
        map over without glue code.
      </>
    ),
    code: '<AgentMessage message={last} onToolApproval={addToolApprovalResponse} />',
  },
  {
    title: 'AG-UI',
    body: (
      <>
        LangGraph, CrewAI, Mastra, Pydantic AI and the rest of the protocol’s integrations, through one hook. Interrupts
        become approval cards.
      </>
    ),
    code: "import { useAgUiAgent } from '@dgesteves/agent-ui-kit/ag-ui';",
  },
  {
    title: 'npm or shadcn',
    body: <>Install the package, or copy a component’s source into your app with the shadcn CLI and make it yours.</>,
    code: 'npx shadcn@latest add @agent-ui-kit/diff-review',
  },
  {
    title: 'Tailwind v4 or plain CSS',
    body: (
      <>
        A Tailwind v4 entry, or a precompiled stylesheet scoped to the components for Tailwind v3 or no Tailwind at all.
      </>
    ),
    code: "import '@dgesteves/agent-ui-kit/styles.css';",
  },
];

const COMPARISON: Array<{ topic: string; kit: ReactNode; elements: ReactNode }> = [
  {
    topic: 'Data in',
    kit: (
      <>
        A <Code>UIMessage</Code> from <Code>useChat</Code> as it is, or an AG-UI agent through <Code>useAgUiAgent</Code>
        . No runtime to adopt.
      </>
    ),
    elements: (
      <>
        Props (agent status also has a runtime-bound variant). With the assistant-ui runtime, its docs show how to map
        approvals, message timing and step usage into them.
      </>
    ),
  },
  {
    topic: 'Diff review',
    kit: (
      <>
        Takes the old and new text of several files and computes the hunks, with word-level highlights. Returns each
        file with only the accepted hunks applied.
      </>
    ),
    elements: <>Takes one file’s hunks, already split, and reports keep or discard per hunk.</>,
  },
  {
    topic: 'Tool timeline',
    kit: <>Every state, with durations measured on the client that leave out time spent waiting for an approval.</>,
    elements: <>A summary of what was done, without durations or states.</>,
  },
  {
    topic: 'Cost',
    kit: <>Prices tokens from your rates and shows the prompt-cache hit rate.</>,
    elements: <>Displays cost strings you format.</>,
  },
  {
    topic: 'Styling',
    kit: <>Tailwind v4, v3 or none: the npm package ships a precompiled stylesheet scoped to its components.</>,
    elements: <>Tailwind v4.</>,
  },
  {
    topic: 'React',
    kit: <>18 or 19.</>,
    elements: <>18 or 19.</>,
  },
];

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.9em] text-[#e8eaed]">{children}</code>;
}

function SectionHeading({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="font-mono text-[11px] font-medium tracking-[0.08em] text-[#8b94a0] uppercase">{eyebrow}</p>
      <h2
        id={id}
        className="mt-3 text-[24px] leading-tight font-semibold tracking-[-0.02em] text-[#f1f3f5] sm:text-[28px]"
      >
        {title}
      </h2>
      {children && <p className="mt-3 text-[15px] leading-relaxed text-pretty text-[#a1a9b4]">{children}</p>}
    </div>
  );
}

function Section({ id, className = '', children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`mx-auto w-full max-w-[1320px] px-4 sm:px-6 ${className}`}>
      <div className="border-line/70 border-t py-14 sm:py-20">{children}</div>
    </section>
  );
}

export function Landing() {
  return (
    <>
      <Section id="kit-heading" className="mt-14 sm:mt-20">
        <SectionHeading id="kit-heading" eyebrow="Components" title="What’s in the kit">
          Use them one at a time, or hand <Code>AgentMessage</Code> a whole assistant message and get all of them, in
          order. Keyboard-first, announced to screen readers, and in both the npm package and the shadcn registry.
        </SectionHeading>
        <ul className="mt-8 grid gap-3 sm:mt-10 sm:grid-cols-2 lg:grid-cols-4">
          {KIT.map((item) => (
            <li key={item.id} className="flex">
              <a
                href={`/gallery#${item.id}`}
                className="group border-line bg-raised/40 focus-visible:outline-cyan-soft relative flex w-full flex-col rounded-xl border p-4 transition-colors hover:border-[#353c47] hover:bg-[#14181d] focus-visible:outline-2 focus-visible:outline-offset-2 sm:p-5"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[14px] font-semibold text-[#e8eaed]">{item.name}</span>
                  <ArrowRightIcon className="size-4 text-[#5b6470] transition-[color,translate] group-hover:translate-x-0.5 group-hover:text-[#a1a9b4] motion-reduce:transition-none" />
                </span>
                <span className="mt-2 text-[13.5px] leading-relaxed text-[#a1a9b4]">{item.description}</span>
                <span className="mt-auto pt-3 font-mono text-[11px] text-[#8b94a0] sm:pt-4">{item.meta}</span>
              </a>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="works-heading">
        <SectionHeading id="works-heading" eyebrow="Works with" title="Fits the stack you already have">
          It renders what your agent already streams, so there’s no state model to adopt. Typed against AI SDK 6 and 7,
          tested on React 18 and 19 in CI, and prerenders under Next.js 16 with <Code>cacheComponents</Code>.
        </SectionHeading>
        <ul className="border-line mt-8 grid overflow-hidden rounded-xl border sm:mt-10 md:grid-cols-2">
          {WORKS_WITH.map((item) => (
            <li
              key={item.title}
              className="border-line flex flex-col gap-3 border-b p-5 last:border-b-0 sm:p-6 md:odd:border-r md:[&:nth-last-child(2)]:border-b-0"
            >
              <h3 className="text-[15px] font-semibold text-[#e8eaed]">{item.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-[#a1a9b4]">{item.body}</p>
              <pre className="border-line mt-auto rounded-lg border bg-[#101317] px-3 py-2.5 font-mono text-[12px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-[#c9d1d9]">
                <code>{item.code}</code>
              </pre>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="compare-heading">
        <SectionHeading id="compare-heading" eyebrow="Comparison" title="How it compares">
          assistant-ui and AI Elements are both good, and you may well want one of them for the chat shell.
          assistant-ui’s Elements collection (August 2026) is the closest to this kit: an approval card, a reviewable
          diff, a trace waterfall, a tool timeline, a cost meter and agent status. Here’s where they differ.
        </SectionHeading>
        <div className="border-line mt-8 overflow-hidden rounded-xl border sm:mt-10">
          <div
            className="border-line hidden grid-cols-[10rem_1fr_1fr] border-b bg-[#12151a] font-mono text-[12px] text-[#a1a9b4] md:grid"
            aria-hidden="true"
          >
            <span className="px-5 py-3" />
            <span className="text-cyan-soft border-line border-l px-5 py-3">agent-ui-kit</span>
            <span className="border-line border-l px-5 py-3">assistant-ui Elements</span>
          </div>
          <dl>
            {COMPARISON.map((row) => (
              <div key={row.topic} className="border-line grid border-b last:border-b-0 md:grid-cols-[10rem_1fr_1fr]">
                <dt className="px-5 pt-4 text-[13px] font-medium text-[#e8eaed] md:py-4">{row.topic}</dt>
                <dd className="border-line px-5 pt-2 pb-2 text-[13.5px] leading-relaxed text-[#c9d1d9] md:border-l md:py-4">
                  <span className="text-cyan-soft mb-0.5 block font-mono text-[11px] md:sr-only">agent-ui-kit: </span>
                  {row.kit}
                </dd>
                <dd className="border-line px-5 pt-2 pb-4 text-[13.5px] leading-relaxed text-[#a1a9b4] md:border-l md:py-4">
                  <span className="mb-0.5 block font-mono text-[11px] text-[#8b94a0] md:sr-only">
                    assistant-ui Elements:{' '}
                  </span>
                  {row.elements}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mt-8 grid gap-6 text-[14px] leading-relaxed text-[#a1a9b4] md:grid-cols-2">
          <p>
            <span className="font-medium text-[#e8eaed]">AI Elements</span> is Vercel’s shadcn registry for AI SDK apps,
            with the widest coverage of the message surface: conversation, prompt input, reasoning, sources, a per-call{' '}
            <Code>Tool</Code> card, a <Code>Confirmation</Code> for approvals, a <Code>Context</Code> usage indicator
            and more. It targets React 19 and Tailwind v4, and is written against AI SDK 6.
          </p>
          <p>
            <span className="font-medium text-[#e8eaed]">They compose.</span> Render the thread with either library and
            use these components for tool parts and side panels. The README has{' '}
            <a
              href={`${GITHUB_URL}#how-it-compares`}
              className="text-cyan-soft focus-visible:outline-cyan-soft rounded-sm underline decoration-[#22d3ee]/40 underline-offset-[3px] hover:decoration-[#22d3ee] focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              the full comparison
              <ArrowUpRightIcon className="ml-0.5 inline size-3.5 align-[-2px]" />
            </a>
            .
          </p>
        </div>
      </Section>

      <section aria-labelledby="start-heading" className="mx-auto w-full max-w-[1320px] px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="border-line relative overflow-hidden rounded-2xl border bg-[#12151a] px-5 py-10 sm:px-10 sm:py-14">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_260px_at_15%_0%,rgb(34_211_238/0.09),transparent_70%)]"
            aria-hidden="true"
          />
          <div className="relative">
            <SectionHeading id="start-heading" eyebrow="Get started" title="Start with one component">
              Most apps start with <Code>AgentMessage</Code> and add the review and telemetry panels later. Install from
              npm, or copy the source in with the shadcn CLI. MIT licensed.
            </SectionHeading>
            <div className="mt-8">
              <CallsToAction />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
