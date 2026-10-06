import type { Metadata } from 'next';
import { Gallery } from '@/components/gallery';
import { Header } from '@/components/header';

export const metadata: Metadata = { title: 'agent-ui-kit · components' };

export default function GalleryPage() {
  return (
    <div className="min-h-dvh">
      <Header page="components" />
      <Gallery />
    </div>
  );
}
