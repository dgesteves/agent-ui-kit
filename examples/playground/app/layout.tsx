import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'agent-ui-kit · playground',
  description:
    'React components for agent-run UX: tool timelines, human-in-the-loop approvals, diff review and run telemetry. Watch a scripted agent run, no API key needed.',
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
