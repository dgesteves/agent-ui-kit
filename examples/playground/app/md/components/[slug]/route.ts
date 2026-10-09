import { componentMarkdown } from '@/lib/component-markdown';
import { COMPONENTS, getComponent } from '@/lib/components';

// Each component page as Markdown: /docs/components/<slug>.md rewrites here (next.config.ts).
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return COMPONENTS.map((c) => ({ slug: c.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const component = getComponent((await params).slug);
  if (!component) return new Response('Not found', { status: 404 });
  return new Response(componentMarkdown(component), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}
