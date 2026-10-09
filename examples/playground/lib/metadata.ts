import type { Metadata } from 'next';

// A page's own openGraph replaces the root's, file-based image included, so name the image again.
const images = [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: 'The agent-ui-kit playground mid-run.' }];

/** Title, description, canonical URL and link previews for a page. */
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
    openGraph: { type: 'website', siteName: 'agent-ui-kit', title, description, url: path, images },
    twitter: { card: 'summary_large_image', title, description, images },
  };
}
