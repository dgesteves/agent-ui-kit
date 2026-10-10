import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { THEME_SCRIPT } from '@/lib/theme';
import { GeistMono } from './fonts';
import './globals.css';

const title = 'signoff-ui: review what your agent changed and control what it may do';
const description =
  'React components for multi-file diff review and tool approvals that return a result your agent acts on. For AI SDK 6 & 7 and AG-UI agents, inside assistant-ui, AI Elements or your own chat. Watch a scripted coding agent run, no API key needed.';

// app/opengraph-image.png is the top of docs/media/hero.png (`pnpm media og`); the docs and the
// components page draw their own (lib/og.tsx).
export const metadata: Metadata = {
  metadataBase: new URL('https://agent-ui-kit-demo.vercel.app'),
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: 'signoff-ui', title, description, url: '/' },
  twitter: { card: 'summary_large_image', title, description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0d0f12' },
  ],
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme class is added before paint by THEME_SCRIPT, so the server's markup can't match it.
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="text-fg font-sans">
        <a
          href="#main"
          className="bg-cyan text-ink focus-visible:outline-cyan-soft fixed top-2 left-2 z-50 -translate-y-16 rounded-md px-3 py-2 text-[13px] font-semibold focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
