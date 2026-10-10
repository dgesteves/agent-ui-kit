import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocArticle } from '@/components/docs/article';
import { getGuide, GUIDES } from '@/lib/docs';
import { pageMetadata } from '@/lib/metadata';

// The introduction is /docs itself.
const PAGES = GUIDES.filter((doc) => doc.href !== '/docs');

export const dynamicParams = false;

export function generateStaticParams() {
  return PAGES.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const doc = getGuide((await params).slug);
  if (!doc) return {};
  return pageMetadata({
    title: `${doc.title} · signoff-ui docs`,
    description: doc.description,
    path: doc.href,
    markdownPath: `${doc.href}.md`,
  });
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const doc = getGuide((await params).slug);
  if (!doc || doc.href === '/docs') notFound();
  return <DocArticle doc={doc} />;
}
