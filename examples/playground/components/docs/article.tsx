import Link from 'next/link';
import { getHeadings, getPager, NAV, readGuide, type DocPage } from '@/lib/docs';
import { ArrowRightIcon } from '../icons';
import { DocMarkdown } from './markdown';
import { PageActions } from './page-actions';
import { TableOfContents } from './toc';

function Pager({ slug }: { slug: string }) {
  const { prev, next } = getPager(slug);
  // After the last guide, the components.
  const after = next ?? { title: 'Components', href: '/gallery', description: '' };
  const card =
    'group focus-visible:outline-cyan-soft flex flex-col gap-1 rounded-xl border border-[#262b33] px-4 py-3.5 transition-colors hover:border-[#353c47] hover:bg-[#12151a] focus-visible:outline-2 focus-visible:outline-offset-2';
  return (
    <nav
      aria-label="Previous and next pages"
      className="mt-16 grid gap-3 border-t border-[#262b33] pt-8 sm:grid-cols-2"
    >
      {prev ? (
        <Link href={prev.href} className={card}>
          <span className="font-mono text-[11px] text-[#8b94a0]">Previous</span>
          <span className="text-[14px] font-medium text-[#e8eaed]">{prev.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" className="hidden sm:block" />
      )}
      <Link href={after.href} className={`${card} sm:items-end sm:text-right`}>
        <span className="font-mono text-[11px] text-[#8b94a0]">Next</span>
        <span className="flex items-center gap-1.5 text-[14px] font-medium text-[#e8eaed]">
          {after.title}
          <ArrowRightIcon className="size-3.5 text-[#8b94a0] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </Link>
    </nav>
  );
}

/** A guide: its title, actions, body and pager, with the table of contents beside it on wide screens. */
export function DocArticle({ doc }: { doc: DocPage }) {
  const markdown = readGuide(doc);
  const headings = getHeadings(markdown);
  const group = NAV.find((g) => g.items.some((item) => item.href === doc.href))?.title;
  const markdownPath = doc.href === '/docs' ? '/docs.md' : `${doc.href}.md`;
  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-12">
      <article className="min-w-0 pt-8 pb-16 lg:pt-12">
        <div className="max-w-[46rem]">
          {group && <p className="text-cyan-soft font-mono text-[12px]">{group}</p>}
          <h1 className="mt-2 text-[30px] leading-tight font-semibold tracking-[-0.025em] text-[#f1f3f5] sm:text-[36px]">
            {doc.title}
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-pretty text-[#a1a9b4] sm:text-[17px]">
            {doc.description}
          </p>
          <div className="mt-6">
            <PageActions markdownPath={markdownPath} />
          </div>
          <div className="mt-10">
            <DocMarkdown markdown={markdown} />
          </div>
          <Pager slug={doc.slug} />
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
