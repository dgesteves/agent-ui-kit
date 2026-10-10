import type { Metadata } from 'next';

/**
 * Title, description, canonical URL and link previews for a page. The preview image is each
 * route's own opengraph-image (lib/og.tsx), which Next.js adds to `openGraph` and `twitter`.
 */
export function pageMetadata({
  title,
  description,
  path,
  markdownPath,
}: {
  title: string;
  description: string;
  path: string;
  /** The page as Markdown, advertised for tools that prefer it. */
  markdownPath?: string;
}): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: path,
      ...(markdownPath ? { types: { 'text/markdown': markdownPath } } : {}),
    },
    openGraph: { type: 'website', siteName: 'signoff-ui', title, description, url: path },
    twitter: { card: 'summary_large_image', title, description },
  };
}
