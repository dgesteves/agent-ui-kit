import Link from 'next/link';
import type { ReactNode } from 'react';
import { getHeadings, getPager, NAV, readGuide, type DocPage, type Heading } from '@/lib/docs';
import { ArrowRightIcon } from '../icons';
import { DocMarkdown } from './markdown';
import { PageActions } from './page-actions';
import { TableOfContents } from './toc';

function Pager({ href }: { href: string }) {
  const { prev, next } = getPager(href);
  // After the last page, the components page.
  const after = next ?? { title: 'All components', href: '/gallery' };
  const card =
    'group focus-visible:outline-cyan-soft flex flex-col gap-1 rounded-xl border border-line px-4 py-3.5 transition-colors hover:border-line-strong hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2';
  return (
    <nav aria-label="Previous and next pages" className="border-line mt-16 grid gap-3 border-t pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className={card}>
          <span className="text-fg-subtle font-mono text-[11px]">Previous</span>
          <span className="text-fg text-[14px] font-medium">{prev.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" className="hidden sm:block" />
      )}
      <Link href={after.href} className={`${card} sm:items-end sm:text-right`}>
        <span className="text-fg-subtle font-mono text-[11px]">Next</span>
        <span className="text-fg flex items-center gap-1.5 text-[14px] font-medium">
          {after.title}
          <ArrowRightIcon className="text-fg-subtle size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </Link>
    </nav>
  );
}

/** A docs page: title, summary, actions, body and pager, with "On this page" beside it on wide screens. */
export function DocShell({
  href,
  group,
  title,
  description,
  markdownPath,
  headings,
  children,
}: {
  href: string;
  group: string | undefined;
  title: string;
  description: string;
  markdownPath: string;
  headings: Heading[];
  children: ReactNode;
}) {
  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-12">
      <article className="min-w-0 pt-8 pb-16 lg:pt-12">
        <div className="max-w-[46rem]">
          {group && <p className="text-cyan-soft font-mono text-[12px]">{group}</p>}
          <h1 className="text-fg-strong mt-2 text-[30px] leading-tight font-semibold tracking-[-0.025em] sm:text-[36px]">
            {title}
          </h1>
          <p className="text-fg-muted mt-3 text-[16px] leading-relaxed text-pretty sm:text-[17px]">{description}</p>
          <div className="mt-6">
            <PageActions markdownPath={markdownPath} />
          </div>
          <div className="mt-10">{children}</div>
          <Pager href={href} />
        </div>
      </article>
      <div className="hidden xl:block">
        <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] [scrollbar-width:thin] overflow-y-auto py-12">
          <TableOfContents headings={headings} />
        </div>
      </div>
    </div>
  );
}

/** A guide, from its Markdown. */
export function DocArticle({ doc }: { doc: DocPage }) {
  const markdown = readGuide(doc);
  return (
    <DocShell
      href={doc.href}
      group={NAV.find((g) => g.items.some((item) => item.href === doc.href))?.title}
      title={doc.title}
      description={doc.description}
      markdownPath={doc.href === '/docs' ? '/docs.md' : `${doc.href}.md`}
      headings={getHeadings(markdown)}
    >
      <DocMarkdown markdown={markdown} />
    </DocShell>
  );
}
