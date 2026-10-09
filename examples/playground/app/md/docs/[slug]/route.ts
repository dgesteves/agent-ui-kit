import { getGuide, GUIDES, readGuide, toMarkdown } from '@/lib/docs';

// Each guide as Markdown, built with the site: /docs/<slug>.md and /docs.md rewrite here (next.config.ts).
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((doc) => ({ slug: doc.slug }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const doc = getGuide((await params).slug);
  if (!doc) return new Response('Not found', { status: 404 });
  return new Response(toMarkdown(doc, readGuide(doc)), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}
