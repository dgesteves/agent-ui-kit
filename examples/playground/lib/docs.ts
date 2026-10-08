import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE_URL } from './site';

/*
 * The docs: guides written in Markdown under content/docs, read when the site builds. The same
 * Markdown renders the page, is served at /docs/<slug>.md, and is what "Copy page" copies.
 */

export interface DocPage {
  /** The Markdown file under content/docs, without the extension. */
  slug: string;
  href: string;
  title: string;
  description: string;
}

export interface NavGroup {
  title: string;
  items: Array<{ title: string; href: string; description?: string }>;
}

export const GUIDES: DocPage[] = [
  {
    slug: 'introduction',
    href: '/docs',
    title: 'Introduction',
    description: 'What agent-ui-kit is, why it exists, and how it reads an agent run.',
  },
  {
    slug: 'getting-started',
    href: '/docs/getting-started',
    title: 'Getting started',
    description:
      'Install from npm or the shadcn registry, add the styles, render a first run in Next.js, and theme it. AI SDK 6 or 7, React 18 or 19.',
  },
  {
    slug: 'ag-ui',
    href: '/docs/ag-ui',
    title: 'AG-UI agents',
    description:
      'Render LangGraph, CrewAI, Mastra and other AG-UI agents with the same components, interrupts included, through useAgUiAgent.',
  },
];

/** The components, until each has its own page: their sections on the components page. */
const COMPONENTS: NavGroup['items'] = [
  {
    title: 'AgentMessage',
    href: '/gallery#agent-message',
    description: 'A whole assistant message: reasoning, markdown, tool calls, approvals, sources',
  },
  { title: 'ToolCallTimeline', href: '/gallery#tool-call-timeline', description: 'Tool calls, durations, errors' },
  { title: 'ApprovalCard', href: '/gallery#approval-card', description: 'Human-in-the-loop approval, risk, deny' },
  { title: 'DiffReview', href: '/gallery#diff-review', description: 'Review edits hunk by hunk, accept, reject' },
  { title: 'RunMeter', href: '/gallery#run-meter', description: 'Tokens, cost, latency, cache hit rate, usage' },
  { title: 'AgentStatus', href: '/gallery#agent-status', description: 'Run state pill, live region' },
  { title: 'Sources', href: '/gallery#sources', description: 'Citations, chips, cards' },
  { title: 'useAgUiAgent', href: '/gallery#ag-ui', description: 'AG-UI agents, LangGraph, interrupts' },
];

export const NAV: NavGroup[] = [
  { title: 'Get started', items: GUIDES.slice(0, 2) },
  { title: 'Guides', items: GUIDES.slice(2) },
  { title: 'Components', items: [{ title: 'All components', href: '/gallery' }, ...COMPONENTS] },
];

export function getGuide(slug: string) {
  return GUIDES.find((doc) => doc.slug === slug);
}

/** The guide before and after this one, in sidebar order. */
export function getPager(slug: string) {
  const index = GUIDES.findIndex((doc) => doc.slug === slug);
  return { prev: GUIDES[index - 1], next: GUIDES[index + 1] };
}

// `next build` and `next start` run in examples/playground.
export function readGuide(doc: DocPage) {
  return readFileSync(join(process.cwd(), 'content/docs', `${doc.slug}.md`), 'utf8');
}

export interface Heading {
  id: string;
  text: string;
  depth: 2 | 3;
}

/** Plain text of inline Markdown: code spans, links and emphasis unwrapped. */
export function plainText(markdown: string) {
  return markdown
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_)(.*?)\1/g, '$2')
    .trim();
}

/** The id a heading gets: lowercase words joined by hyphens, as GitHub does it. */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** `##` and `###` headings, outside code blocks, for the table of contents and search. */
export function getHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  let fenced = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    if (fenced) continue;
    const match = /^(##|###) (.+)$/.exec(line);
    if (!match) continue;
    const text = plainText(match[2]!);
    headings.push({ id: slugify(text), text, depth: match[1]!.length as 2 | 3 });
  }
  return headings;
}

/** The page as one Markdown document: title, summary and body, with absolute links. */
export function toMarkdown(doc: DocPage, markdown: string) {
  const body = markdown
    // Install blocks are ordinary shell commands outside the site.
    .replace(/^```package-install$/gm, '```bash')
    .replace(/\]\((\/[^)]*)\)/g, `](${SITE_URL}$1)`);
  return `# ${doc.title}\n\n> ${doc.description}\n\nSource: ${SITE_URL}${doc.href}\n\n${body.trim()}\n`;
}

/** What the sidebar search looks through: each guide and its sections, and the components. */
export function getSearchIndex() {
  const guides = GUIDES.map((doc) => ({
    title: doc.title,
    description: doc.description,
    href: doc.href,
    sections: getHeadings(readGuide(doc)).map((h) => ({ title: h.text, href: `${doc.href}#${h.id}` })),
  }));
  const components = NAV[2]!.items.map((item) => ({
    title: item.title,
    description: item.description ?? '',
    href: item.href,
    sections: [],
  }));
  return [...guides, ...components];
}

export type SearchIndex = ReturnType<typeof getSearchIndex>;
