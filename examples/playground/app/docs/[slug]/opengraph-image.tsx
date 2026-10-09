import { getGuide, GUIDES } from '@/lib/docs';
import { OG_SIZE, ogImage } from '@/lib/og';

export const alt = 'An agent-ui-kit docs page';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
  return GUIDES.filter((doc) => doc.href !== '/docs').map((doc) => ({ slug: doc.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const doc = getGuide((await params).slug)!;
  return ogImage({ eyebrow: 'Docs', title: doc.title, description: doc.description });
}
