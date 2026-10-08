import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
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
      <body className="font-sans text-[#e8eaed]">{children}</body>
    </html>
  );
}
