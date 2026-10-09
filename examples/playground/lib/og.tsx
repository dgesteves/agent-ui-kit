import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/*
 * Link preview images for the docs and the components page, drawn when the site builds: the page's
 * title and summary on the site's ink, in Geist. The home page's preview is a screenshot of the
 * playground instead (app/opengraph-image.png, from `pnpm media og`).
 */

export const OG_SIZE = { width: 1200, height: 630 };

// `next build` runs in examples/playground.
const font = (path: string) => readFileSync(join(process.cwd(), 'node_modules/geist/dist/fonts', path));

function Logo() {
  return (
    <svg width="44" height="44" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#181c22" stroke="#262b33" />
      <path d="M11 9v14" stroke="#353c47" strokeWidth="2" strokeLinecap="round" />
      <circle cx="11" cy="9" r="2.6" fill="#22d3ee" />
      <circle cx="11" cy="16" r="2.6" fill="#67e8f9" />
      <circle cx="11" cy="23" r="2.6" fill="#f0468a" />
      <path d="M17 9h7M17 16h5M17 23h7" stroke="#e8eaed" strokeWidth="2" strokeLinecap="round" opacity=".5" />
    </svg>
  );
}

export function ogImage({
  eyebrow,
  title,
  description,
  code = false,
}: {
  eyebrow: string;
  title: string;
  description: string;
  /** Set the title in Geist Mono, as a component's name. */
  code?: boolean;
}) {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '64px 72px',
        backgroundColor: '#0d0f12',
        backgroundImage:
          'radial-gradient(circle at 12% 0%, rgba(34, 211, 238, 0.16), transparent 46%), radial-gradient(circle at 96% 8%, rgba(240, 70, 138, 0.07), transparent 40%)',
        color: '#e8eaed',
        fontFamily: 'Geist',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Logo />
        <span style={{ fontFamily: 'Geist Mono', fontSize: 26, fontWeight: 500, color: '#e8eaed' }}>agent-ui-kit</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
        <span style={{ fontFamily: 'Geist Mono', fontSize: 24, color: '#67e8f9', letterSpacing: 1 }}>{eyebrow}</span>
        <span
          style={{
            marginTop: 18,
            fontFamily: code ? 'Geist Mono' : 'Geist',
            fontSize: code ? 70 : 74,
            fontWeight: code ? 500 : 600,
            letterSpacing: code ? -1 : -2.5,
            lineHeight: 1.05,
            color: '#f1f3f5',
          }}
        >
          {title}
        </span>
        <span
          style={{
            marginTop: 24,
            maxWidth: 940,
            fontSize: 30,
            lineHeight: 1.4,
            color: '#a1a9b4',
          }}
        >
          {description}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 48,
          paddingTop: 28,
          borderTop: '1px solid #262b33',
          fontFamily: 'Geist Mono',
          fontSize: 22,
          color: '#8b94a0',
        }}
      >
        <span>agent-ui-kit-demo.vercel.app</span>
        <span style={{ color: '#c9d1d9' }}>AI SDK 6 & 7 · AG-UI</span>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Geist', data: font('geist-sans/Geist-Regular.ttf'), weight: 400, style: 'normal' },
        { name: 'Geist', data: font('geist-sans/Geist-SemiBold.ttf'), weight: 600, style: 'normal' },
        { name: 'Geist Mono', data: font('geist-mono/GeistMono-Regular.ttf'), weight: 400, style: 'normal' },
        { name: 'Geist Mono', data: font('geist-mono/GeistMono-Medium.ttf'), weight: 500, style: 'normal' },
      ],
    },
  );
}
