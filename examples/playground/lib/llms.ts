import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { componentHref, COMPONENTS } from './components';
import { GUIDES } from './docs';

/*
 * /llms.txt and /llms-full.txt (https://llmstxt.org), built from the repository's README and
 * registry.json when the playground builds, so they always match the docs on GitHub.
 */

const SITE = 'https://agent-ui-kit-demo.vercel.app';
const REPO = 'https://github.com/dgesteves/agent-ui-kit';
// `next build` runs in examples/playground.
const root = join(process.cwd(), '../..');

interface RegistryItem {
  name: string;
  title: string;
  description: string;
}

function readme() {
  return readFileSync(join(root, 'README.md'), 'utf8');
}

function registryItems(): RegistryItem[] {
  return (JSON.parse(readFileSync(join(root, 'registry.json'), 'utf8')) as { items: RegistryItem[] }).items;
}

/** The README as plain markdown: no images or badges, and links that work outside GitHub. */
function plain(markdown: string) {
  return (
    markdown
      // The demo video and the image npm shows instead (see packages/agent-ui-kit/scripts/npm-readme.mjs).
      .replace(/<!-- npm-readme:video -->[\s\S]*?<!-- npm-readme:image[\s\S]*?-->\n*/g, '')
      .replace(/<!--[\s\S]*?-->\n*/g, '')
      .replace(/<picture>[\s\S]*?<\/picture>\n*/g, '')
      .replace(/<p align="center">[\s\S]*?<\/p>\n*/g, '')
      .replace(/<img [^>]*>\n*/g, '')
      .replace(/^\[!\[.*\n/gm, '')
      .replace(/\]\(#([^)]+)\)/g, `](${REPO}#$1)`)
      .replace(/\]\((?!https?:|mailto:)\.?\/?([^)]+)\)/g, `](${REPO}/blob/main/$1)`)
      .replace(/\n{3,}/g, '\n\n')
  );
}

/** `## Heading` sections of the README, by heading. */
function sections(markdown: string) {
  const out = new Map<string, string>();
  for (const part of markdown.split(/^(?=## )/m).slice(1)) {
    const [heading = '', ...body] = part.split('\n');
    out.set(heading.replace(/^## /, ''), body.join('\n'));
  }
  return out;
}

const firstSentence = (text: string) => /^.*?\.(?=\s|$)/.exec(text.trim())?.[0] ?? text.trim();

const anchor = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

function summary(markdown: string) {
  const intro = plain(markdown.slice(0, markdown.indexOf('\n## ')));
  const paragraphs = intro
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('**[Open'));
  return { lead: paragraphs[0] ?? '', rest: paragraphs.slice(1) };
}

export function llmsTxt() {
  const markdown = readme();
  const { lead, rest } = summary(markdown);
  const docs = [...sections(markdown).keys()]
    .filter((heading) => !['License', 'Roadmap'].includes(heading))
    .map((heading) => `- [${heading}](${REPO}#${anchor(heading)})`);
  const components = (sections(markdown).get('Components') ?? '')
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const [heading = '', ...body] = block.split('\n');
      const text = body.find((line) => line.trim() && !line.startsWith('<') && !line.startsWith('```')) ?? '';
      return `- ${heading.trim()}: ${firstSentence(text)}`;
    });
  return [
    '# agent-ui-kit',
    '',
    `> ${lead}`,
    '',
    ...rest.flatMap((p) => [p, '']),
    '## Docs',
    '',
    ...GUIDES.map((doc) => `- [${doc.title}](${SITE}${doc.href}.md): ${doc.description}`),
    ...COMPONENTS.map(
      (c) =>
        `- [${c.name}](${SITE}${componentHref(c.slug)}.md): ${c.summary.replace(/`/g, '')} Props, keyboard, theming.`,
    ),
    `- [Everything in one file](${SITE}/llms-full.txt): the README as plain markdown, and the shadcn registry items`,
    `- [The quickstart, running](${REPO}/tree/main/examples/nextjs-minimal): a Next.js 16 app against a scripted model`,
    ...docs,
    '',
    '## Components',
    '',
    ...components,
    '',
    '## Optional',
    '',
    `- [Playground](${SITE}): a scripted agent run with replay and keyboard controls`,
    `- [Component gallery](${SITE}/gallery): every component in isolation, with install snippets`,
    `- [npm package](https://www.npmjs.com/package/@dgesteves/agent-ui-kit)`,
    `- [Changelog](${REPO}/blob/main/packages/agent-ui-kit/CHANGELOG.md)`,
    '',
  ].join('\n');
}

export function llmsFullTxt() {
  const markdown = plain(readme());
  const items = registryItems().map(
    (item) =>
      `- \`${item.name}\` (${item.title}): ${item.description} \`npx shadcn@latest add @agent-ui-kit/${item.name}\``,
  );
  return [markdown.trimEnd(), '', '## shadcn registry items', '', ...items, ''].join('\n');
}
