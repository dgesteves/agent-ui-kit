import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComponentPage } from '@/components/docs/component-page';
import { componentHref, COMPONENTS, getComponent } from '@/lib/components';
import { pageMetadata } from '@/lib/metadata';

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPONENTS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const component = getComponent((await params).slug);
  if (!component) return {};
  const href = componentHref(component.slug);
  return pageMetadata({
    title: `${component.name} · signoff-ui docs`,
    description: `${component.summary.replace(/`/g, '')} Props, install, keyboard and theming.`,
    path: href,
    markdownPath: `${href}.md`,
  });
}

export default async function ComponentDocsPage({ params }: { params: Promise<{ slug: string }> }) {
  const component = getComponent((await params).slug);
  if (!component) notFound();
  return <ComponentPage component={component} />;
}
