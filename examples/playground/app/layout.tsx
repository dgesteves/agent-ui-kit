import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { GeistMono } from './fonts';
import './globals.css';

const title = 'agent-ui-kit · playground';
const description =
  'React components for agent-run UX: tool timelines, human-in-the-loop approvals, diff review and run telemetry, for AI SDK 6 & 7 and AG-UI. Watch a scripted agent run, no API key needed.';

// app/opengraph-image.png is the top of docs/media/hero.png (`pnpm media og`).
export const metadata: Metadata = {
  metadataBase: new URL('https://agent-ui-kit-demo.vercel.app'),
  title,
  description,
  openGraph: { type: 'website', siteName: 'agent-ui-kit', title, description, url: '/' },
  twitter: { card: 'summary_large_image', title, description },
};

export const viewport: Viewport = {
  themeColor: '#0d0f12',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans text-[#e8eaed]">
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
