import Link from 'next/link';
import type { ReactNode } from 'react';
import { DEMOS } from '@/components/demos';
import { ThemingDemo } from '@/components/demos/theming';
import { ComponentInstall } from '@/components/docs/component-install';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { ArrowRightIcon } from '@/components/icons';
import { componentHref, getComponent } from '@/lib/components';
import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'Components · signoff-ui',
  description:
    'Every signoff-ui component in isolation: diff review and approval card first, then tool call timeline, status, run meter, sources, markdown, reasoning, a whole message and an AG-UI agent, with npm and shadcn install snippets.',
  path: '/gallery',
});

// Page order; each id is the section's anchor, which launch posts and the README link to.
const SECTIONS: Array<{ id: string; slug?: string; heading: string; description: string }> = [
  {
    id: 'diff-review',
    slug: 'diff-review',
    heading: '<DiffReview />',
    description:
      'Accept or reject agent edits hunk by hunk or file by file, comment on lines, and send the agent what you applied, rejected and said. Large files are diffed in a worker and render only what is near the screen.',
  },
  {
    id: 'use-diff-review',
    slug: 'use-diff-review',
    heading: 'useDiffReview(options)',
    description:
      'The same review in markup of its own: this list uses the site’s classes and none of the kit’s, and the hook brings the keyboard, decisions, comments and the result.',
  },
  {
    id: 'approval-card',
    slug: 'approval-card',
    heading: '<ApprovalCard />',
    description: 'Approve or deny a tool call, with what will run, its risk, a reason and Y / N shortcuts.',
  },
  {
    id: 'tool-call-timeline',
    slug: 'tool-call-timeline',
    heading: '<ToolCallTimeline />',
    description: 'Every tool state with durations, a waterfall, and expandable input and output.',
  },
  {
    id: 'agent-status',
    slug: 'agent-status',
    heading: '<AgentStatus />',
    description: 'Run state in one pill, announced through a live region.',
  },
  {
    id: 'run-meter',
    slug: 'run-meter',
    heading: '<RunMeter />',
    description: 'Tokens, estimated cost and latency; compact for headers, expanded for panels.',
  },
  {
    id: 'sources',
    slug: 'sources',
    heading: '<Sources />',
    description: 'Citations as compact chips or cards; inline [n] markers link to them.',
  },
  {
    id: 'theming',
    heading: 'Theming',
    description:
      'Every color, radius and font is a CSS variable. Light is the default, .dark switches, and any subtree can override tokens.',
  },
  {
    id: 'agent-message',
    slug: 'agent-message',
    heading: '<AgentMessage />',
    description: 'A whole assistant UIMessage: reasoning, streaming markdown, grouped tool calls and sources.',
  },
  {
    id: 'markdown',
    slug: 'markdown',
    heading: '<Markdown />',
    description: 'Streaming-safe markdown: syntax that hasn’t closed yet never flashes raw, and no raw HTML.',
  },
  {
    id: 'reasoning',
    slug: 'reasoning',
    heading: '<Reasoning />',
    description: 'Open while the model thinks, then one line: “Thought for 1.7s”.',
  },
  {
    id: 'ag-ui',
    slug: 'use-ag-ui-agent',
    heading: 'useAgUiAgent(agent)',
    description:
      'AG-UI agents (LangGraph, CrewAI, Mastra, Pydantic AI) through the same components. This one is a real @ag-ui/client agent replaying a LangGraph-style run: steps, streamed tool arguments, and an interrupt that resumes the run when you answer it.',
  },
];

function Section({ id, slug, heading, description }: (typeof SECTIONS)[number]) {
  const component = slug ? getComponent(slug) : undefined;
  const Demo = slug ? DEMOS[slug] : ThemingDemo;
  const docs = component ? componentHref(component.slug) : '/docs/getting-started#theming';
  const frame: ReactNode = (
    <div data-shot={id} className="border-signoff-border bg-signoff-bg rounded-2xl border p-3 sm:p-6">
      {Demo ? <Demo /> : null}
    </div>
  );
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-fg font-mono text-sm font-semibold">
            {heading}
          </h2>
          <p className="text-fg-muted mt-1 max-w-2xl text-[13px]">{description}</p>
        </div>
        <Link
          href={docs}
          className="text-cyan-soft focus-visible:outline-cyan-soft inline-flex items-center gap-1 rounded-sm text-[13px] font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {component ? 'Docs and props' : 'Theming docs'}
          <span className="sr-only"> for {component?.name ?? 'theming'}</span>
          <ArrowRightIcon className="size-3.5" />
        </Link>
      </div>
      {frame}
      {component && (
        <div className="mt-3">
          <ComponentInstall component={component} />
        </div>
      )}
    </section>
  );
}

export default function GalleryPage() {
  return (
    <div className="min-h-dvh">
      <Header page="components" />
      <main id="main" className="mx-auto w-full max-w-[1000px] px-4 pt-10 pb-24 sm:px-6">
        <div className="max-w-2xl">
          <h1 className="text-fg text-2xl font-semibold tracking-tight">Components</h1>
          <p className="text-fg-muted mt-2 text-[14px] leading-relaxed">
            Each component in isolation, rendered from AI SDK 6 and 7 message parts (or an AG-UI agent, at the end),
            with how to install it from npm or as a shadcn registry item. Everything here is interactive and keyboard
            accessible; each component&apos;s docs page has its props, keyboard and theming hooks. The frames follow the
            site&apos;s theme: switch it in the header to see either palette.
          </p>
        </div>
        <div className="mt-14 flex flex-col gap-16">
          {SECTIONS.map((section) => (
            <Section key={section.id} {...section} />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}
