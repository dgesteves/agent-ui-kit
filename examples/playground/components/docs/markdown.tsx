import Link from 'next/link';
import type { ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { slugify } from '@/lib/docs';
import { PackageInstall } from './code';
import { CodeBlock } from './code-block';

/*
 * Renders a guide's Markdown on the server: headings with anchors, highlighted code with a copy
 * button, install commands as package-manager tabs, and site links through next/link.
 */

/** The bit of a hast node this file reads. */
export interface HastNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: unknown };
  data?: { meta?: string | null };
  children?: HastNode[];
}

function textOf(node: HastNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

function Heading({ level, node, children }: { level: 2 | 3 | 4; node?: HastNode; children: ReactNode }) {
  const id = slugify(textOf(node));
  const Tag = `h${level}` as const;
  return (
    <Tag id={id}>
      <a href={`#${id}`} className="heading-anchor">
        {children}
      </a>
    </Tag>
  );
}

/** A fenced block: highlighted code, or package-manager tabs for ```package-install. */
export function FencedCode({ node }: { node?: HastNode }) {
  const code = node?.children?.find((child) => child.tagName === 'code');
  const className = code?.properties?.className;
  const language = (Array.isArray(className) ? String(className[0] ?? '') : '').replace(/^language-/, '');
  const text = textOf(code).replace(/\n$/, '');
  if (language === 'package-install') return <PackageInstall command={text.trim()} />;
  const title = /title="([^"]+)"/.exec(code?.data?.meta ?? '')?.[1];
  return <CodeBlock code={text} language={language || undefined} title={title} />;
}

/** Line-break opportunities after slashes, so paths wrap at a segment rather than mid-word. */
function breakable(children: ReactNode) {
  if (typeof children !== 'string' || !children.includes('/')) return children;
  return children.split('/').flatMap((part, i) => (i === 0 ? [part] : ['/', <wbr key={i} />, part]));
}

const components: Components = {
  // Inline code only: fenced blocks render through `pre`, which reads the node itself.
  code: ({ children }) => <code>{breakable(children)}</code>,
  h2: ({ node, children }) => (
    <Heading level={2} node={node as HastNode}>
      {children}
    </Heading>
  ),
  h3: ({ node, children }) => (
    <Heading level={3} node={node as HastNode}>
      {children}
    </Heading>
  ),
  h4: ({ node, children }) => (
    <Heading level={4} node={node as HastNode}>
      {children}
    </Heading>
  ),
  pre: ({ node }) => <FencedCode node={node as HastNode} />,
  a: ({ href = '', children }) =>
    href.startsWith('/') || href.startsWith('#') ? (
      <Link href={href}>{children}</Link>
    ) : (
      <a href={href} rel="noreferrer">
        {children}
      </a>
    ),
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
};

export function DocMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="docs-prose">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
