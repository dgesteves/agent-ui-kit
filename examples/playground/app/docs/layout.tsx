import type { ReactNode } from 'react';
import { DocsSidebar } from '@/components/docs/sidebar';
import { Footer } from '@/components/footer';
import { Header } from '@/components/header';
import { getSearchIndex, NAV } from '@/lib/docs';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Header page="docs" />
      <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-6 lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)] lg:gap-12">
        <DocsSidebar nav={NAV} index={getSearchIndex()} />
        <main id="main" className="min-w-0">
          {children}
        </main>
      </div>
      <Footer />
    </div>
  );
}
