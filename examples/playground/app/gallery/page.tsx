import type { Metadata } from 'next';
import { Gallery } from '@/components/gallery';
import { Header } from '@/components/header';

const title = 'agent-ui-kit · components';
const description =
  'Every agent-ui-kit component in isolation: status, tool call timeline, approval card, diff review, run meter, sources, a whole message and an AG-UI agent, with npm and shadcn install snippets.';

// A page's own openGraph replaces the root's, file-based image included, so name the image again.
const images = [{ url: '/opengraph-image.png', width: 1200, height: 630, alt: 'The agent-ui-kit playground mid-run.' }];

export const metadata: Metadata = {
  title,
  description,
  openGraph: { type: 'website', siteName: 'agent-ui-kit', title, description, url: '/gallery', images },
  twitter: { card: 'summary_large_image', title, description, images },
};

export default function GalleryPage() {
  return (
    <div className="min-h-dvh">
      <Header page="components" />
      <Gallery />
    </div>
  );
}
