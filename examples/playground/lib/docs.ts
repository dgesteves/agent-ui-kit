import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getInterface } from './api';
import { componentHref, COMPONENTS } from './components';
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
    description:
      'What signoff-ui is: reviewing what an agent changed and approving what it may do, with the result going back to the agent.',
  },
  {
    slug: 'getting-started',
    href: '/docs/getting-started',
    title: 'Getting started',
    description:
      'Install from npm or the shadcn registry, add the styles, and build a Next.js run with a diff review and an approval. AI SDK 6 or 7, React 18 or 19.',
  },
  {
    slug: 'chat-ui',
    href: '/docs/chat-ui',
    title: 'Inside your chat UI',
    description:
      'Use the review and approval components in assistant-ui, AI Elements or your own chat, with the code for each.',
  },
  {
    slug: 'ag-ui',
    href: '/docs/ag-ui',
    title: 'AG-UI agents',
    description:
      'Render LangGraph, CrewAI, Mastra and other AG-UI agents with the same components, interrupts included, through useAgUiAgent.',
  },
  {
    slug: 'accessibility',
    href: '/docs/accessibility',
    title: 'Accessibility',
    description:
      'Keyboard shortcuts scoped to focus, managed focus, announcements, contrast and how they are tested, with axe in jsdom and in Chrome.',
  },
  {
    slug: 'labels',
    href: '/docs/labels',
    title: 'Labels and translations',
    description:
      'Every word the components show or announce is a label: translate them all with one provider, or change a few, with a complete Portuguese example.',
  },
  {
    slug: 'limits',
    href: '/docs/limits',
    title: 'Performance and limits',
    description:
      'Bundle size per import, the stylesheet, known limitations with measured numbers, and what comes next.',
  },
  {
    slug: 'comparison',
    href: '/docs/comparison',
    title: 'How it compares',
    description: 'signoff-ui next to assistant-ui and AI Elements: what each does better, and where this kit differs.',
  },
  {
    slug: 'migrating-from-agent-ui-kit',
    href: '/docs/migrating-from-agent-ui-kit',
    title: 'Migrating from @dgesteves/agent-ui-kit',
    description:
      'The package is now signoff-ui: swap it, rename the CSS variables, classes and attributes with one command, and what changed in styles.css.',
  },
];

export const NAV: NavGroup[] = [
  { title: 'Get started', items: GUIDES.slice(0, 2) },
  { title: 'Guides', items: GUIDES.slice(2) },
  {
    title: 'Components',
    items: [
      { title: 'Overview', href: '/gallery', description: 'Every component on one page' },
      ...COMPONENTS.map((c) => ({ title: c.name, href: componentHref(c.slug), description: c.summary })),
    ],
  },
];

/** Every docs page in reading order, for previous and next. */
const ORDER = [...GUIDES, ...COMPONENTS.map((c) => ({ title: c.name, href: componentHref(c.slug) }))];

export function getGuide(slug: string) {
  return GUIDES.find((doc) => doc.slug === slug);
}

/** The pages before and after this one, in sidebar order. */
export function getPager(href: string) {
  const index = ORDER.findIndex((page) => page.href === href);
  return { prev: ORDER[index - 1], next: ORDER[index + 1] };
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
  // Components, with their props, so "allowedImageHosts" finds AgentMessage.
  const components = COMPONENTS.map((c) => ({
    title: c.name,
    description: c.summary,
    href: componentHref(c.slug),
    sections: c.api.flatMap((entry) => {
      const owner = entry.props ? entry.name : entry.returns;
      const doc = getInterface(entry.props ?? entry.returns!);
      return doc.props.map((prop) => ({
        title: prop.name,
        href: `${componentHref(c.slug)}#${`${owner}-${prop.name}`.toLowerCase()}`,
      }));
    }),
  }));
  return [...guides, ...components];
}

export type SearchIndex = ReturnType<typeof getSearchIndex>;
