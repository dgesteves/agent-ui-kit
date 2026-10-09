import { COMPONENTS, getComponent } from '@/lib/components';
import { OG_SIZE, ogImage } from '@/lib/og';

export const alt = 'An agent-ui-kit component';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
  return COMPONENTS.map((c) => ({ slug: c.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const component = getComponent((await params).slug)!;
  return ogImage({
    eyebrow: 'Components',
    title: component.name.startsWith('use') ? `${component.name}()` : `<${component.name} />`,
    description: component.summary.replace(/`/g, ''),
    code: true,
  });
}
