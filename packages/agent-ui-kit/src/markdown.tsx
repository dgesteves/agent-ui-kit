import { memo, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remend from 'remend';
import { CodeLines, CopyButton } from './lib/primitives';
import { cn } from './lib/utils';

/* Minimal structural syntax-tree types, so the plugins need no @types packages. */
interface TreeNode {
  type: string;
  value?: string;
  tagName?: string;
  url?: string;
  properties?: Record<string, unknown>;
  data?: { hProperties?: Record<string, unknown> };
  children?: TreeNode[];
}

/** remark plugin: turn `[1]`-style markers in text into citation links (`#source-1`). */
function remarkCitations(options: { idPrefix: string; count: number }) {
  return (tree: TreeNode) => {
    const visit = (node: TreeNode) => {
      if (!node.children || node.type === 'link' || node.type === 'linkReference') return;
      const next: TreeNode[] = [];
      for (const child of node.children) {
        if (child.type !== 'text' || !child.value || !/\[\d{1,3}\]/.test(child.value)) {
          visit(child);
          next.push(child);
          continue;
        }
        const re = /\[(\d{1,3})\]/g;
        let last = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(child.value))) {
          const n = Number(match[1]);
          if (n < 1 || n > options.count) continue;
          if (match.index > last) next.push({ type: 'text', value: child.value.slice(last, match.index) });
          next.push({
            type: 'link',
            url: `#${options.idPrefix}-${n}`,
            data: { hProperties: { dataCitation: String(n) } },
            children: [{ type: 'text', value: String(n) }],
          });
          last = match.index + match[0].length;
        }
        if (last < child.value.length) next.push({ type: 'text', value: child.value.slice(last) });
      }
      node.children = next;
    };
    visit(tree);
  };
}

/** HTML void elements: hast gives them an empty `children` array, but React throws if they get any. */
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** rehype plugin: append a caret element after the last rendered text while streaming. */
function rehypeCaret() {
  return (tree: TreeNode) => {
    let node: TreeNode = tree;
    for (;;) {
      const last = node.children?.at(-1);
      // Never descend into void elements (a trailing `---` or image): the caret goes after them instead.
      if (
        last &&
        last.type === 'element' &&
        last.children &&
        last.tagName !== 'pre' &&
        !VOID_ELEMENTS.has(last.tagName ?? '')
      )
        node = last;
      else if (last && last.type === 'text' && last.value?.trim() === '' && node.children!.length > 1) {
        // Skip trailing whitespace text nodes between block elements.
        node.children = node.children!.slice(0, -1);
      } else break;
    }
    node.children ??= [];
    node.children.push({ type: 'element', tagName: 'span', properties: { dataAuiCaret: '' }, children: [] });
  };
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return '';
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children;
  const className =
    child && typeof child === 'object' && 'props' in child
      ? ((child.props as { className?: string }).className ?? '')
      : '';
  const language = /language-([\w-]+)/.exec(className)?.[1] ?? 'text';
  const code = textOf(children).replace(/\n$/, '');
  return (
    <div className="group/code border-aui-border bg-aui-bg/70 relative my-3 overflow-hidden rounded-lg border">
      <div className="border-aui-border flex items-center justify-between border-b px-3 py-1">
        <span className="font-aui-mono text-aui-fg-subtle text-[11px]">{language === 'text' ? 'code' : language}</span>
        <CopyButton text={code} label="Copy code" />
      </div>
      <pre className="font-aui-mono text-aui-fg overflow-x-auto px-3 py-2.5 text-[12.5px] leading-relaxed">
        <CodeLines code={code} language={normalizeLanguage(language)} />
      </pre>
    </div>
  );
}

function normalizeLanguage(lang: string) {
  const map: Record<string, string> = {
    typescript: 'ts',
    javascript: 'js',
    bash: 'sh',
    shell: 'sh',
    zsh: 'sh',
    python: 'py',
    yml: 'yaml',
  };
  return map[lang] ?? lang;
}

const components: Components = {
  p: ({ node: _node, className, ...props }) => (
    <p className={cn('my-2.5 first:mt-0 last:mb-0', className)} {...props} />
  ),
  h1: ({ node: _node, className, children, ...props }) => (
    <h1 className={cn('text-aui-fg mt-5 mb-2 text-lg font-semibold tracking-tight first:mt-0', className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ node: _node, className, children, ...props }) => (
    <h2 className={cn('text-aui-fg mt-5 mb-2 text-base font-semibold tracking-tight first:mt-0', className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ node: _node, className, children, ...props }) => (
    <h3 className={cn('text-aui-fg mt-4 mb-1.5 text-[15px] font-semibold first:mt-0', className)} {...props}>
      {children}
    </h3>
  ),
  h4: ({ node: _node, className, children, ...props }) => (
    <h4 className={cn('text-aui-fg mt-3 mb-1 text-sm font-semibold first:mt-0', className)} {...props}>
      {children}
    </h4>
  ),
  ul: ({ node: _node, className, ...props }) => (
    <ul className={cn('marker:text-aui-fg-subtle my-2.5 list-disc space-y-1 pl-5', className)} {...props} />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol className={cn('marker:text-aui-fg-subtle my-2.5 list-decimal space-y-1 pl-5', className)} {...props} />
  ),
  li: ({ node: _node, className, ...props }) => <li className={cn('pl-1', className)} {...props} />,
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      className={cn('border-aui-border-strong text-aui-fg-muted my-3 border-l-2 pl-3', className)}
      {...props}
    />
  ),
  hr: ({ node: _node, className, ...props }) => <hr className={cn('border-aui-border my-4', className)} {...props} />,
  strong: ({ node: _node, className, ...props }) => (
    <strong className={cn('text-aui-fg font-semibold', className)} {...props} />
  ),
  a: ({ node: _node, className, href, children, ...props }) => {
    const citation = (props as Record<string, unknown>)['data-citation'];
    if (citation !== undefined) {
      return (
        <a
          href={href}
          className="bg-aui-accent/12 font-aui-mono text-aui-accent-fg hover:bg-aui-accent/25 focus-visible:outline-aui-ring mx-0.5 inline-flex h-4 min-w-4 -translate-y-px items-center justify-center rounded-[4px] px-1 align-middle text-[10px] font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
          aria-label={`Source ${String(citation)}`}
        >
          {children}
        </a>
      );
    }
    const external = typeof href === 'string' && /^https?:\/\//.test(href);
    return (
      <a
        href={href}
        className={cn(
          'text-aui-accent-fg decoration-aui-accent/40 hover:decoration-aui-accent focus-visible:outline-aui-ring font-medium underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1',
          className,
        )}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...props}
      >
        {children}
      </a>
    );
  },
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn(
        className?.includes('language-')
          ? className
          : 'border-aui-border bg-aui-surface-2 font-aui-mono text-aui-fg rounded-[5px] border px-1 py-px text-[0.86em]',
      )}
      {...props}
    />
  ),
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  table: ({ node: _node, className, ...props }) => (
    <div className="border-aui-border my-3 overflow-x-auto rounded-lg border">
      <table className={cn('w-full text-left text-[13px]', className)} {...props} />
    </div>
  ),
  th: ({ node: _node, className, ...props }) => (
    <th
      className={cn('border-aui-border bg-aui-surface-2 text-aui-fg border-b px-3 py-1.5 font-semibold', className)}
      {...props}
    />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td className={cn('border-aui-border/60 text-aui-fg-muted border-b px-3 py-1.5', className)} {...props} />
  ),
  span: ({ node: _node, ...props }) =>
    (props as Record<string, unknown>)['data-aui-caret'] !== undefined ? (
      <span
        aria-hidden="true"
        className="bg-aui-accent motion-safe:animate-aui-blink ml-0.5 inline-block h-[1.1em] w-[0.5ch] translate-y-[0.2em] rounded-[1px]"
      />
    ) : (
      <span {...props} />
    ),
};

export interface MarkdownProps {
  children: string;
  /** Repairs unterminated syntax and shows a caret while text is still arriving. */
  streaming?: boolean;
  /** Number of available sources; `[n]` markers up to this count become citation links. */
  citations?: number;
  /** Must match the `idPrefix` of the `Sources` the citations point to. Default "source". */
  citationPrefix?: string;
  components?: Components;
  className?: string;
}

/**
 * Streaming-safe markdown (GFM). While `streaming`, unterminated emphasis, code
 * and links are closed before parsing so partial output never flashes raw syntax.
 * Raw HTML is not rendered and URLs are sanitized.
 */
export const Markdown = memo(function Markdown({
  children,
  streaming = false,
  citations = 0,
  citationPrefix = 'source',
  components: overrides,
  className,
}: MarkdownProps) {
  const text = useMemo(
    () => (streaming ? remend(children, { linkMode: 'text-only' }) : children),
    [children, streaming],
  );
  const remarkPlugins = useMemo(
    () =>
      citations > 0
        ? [remarkGfm, [remarkCitations, { idPrefix: citationPrefix, count: citations }] as const]
        : [remarkGfm],
    [citations, citationPrefix],
  );
  const rehypePlugins = useMemo(() => (streaming ? [rehypeCaret] : []), [streaming]);
  const merged = useMemo(() => (overrides ? { ...components, ...overrides } : components), [overrides]);
  return (
    <div
      data-aui
      data-slot="markdown"
      className={cn('font-aui-sans text-aui-fg text-[14.5px] leading-[1.7] [overflow-wrap:anywhere]', className)}
    >
      <ReactMarkdown
        // Plugin tuples are typed loosely by unified; the shapes above are correct.
        remarkPlugins={remarkPlugins as never}
        rehypePlugins={rehypePlugins as never}
        components={merged}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
