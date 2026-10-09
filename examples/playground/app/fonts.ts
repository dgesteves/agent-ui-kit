import localFont from 'next/font/local';

/*
 * Geist Mono, as geist/font/mono declares it but not preloaded: it sets labels and code, never the
 * headline or the text that paints first, so it shouldn't compete with them for the first bytes.
 */
export const GeistMono = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-geist-mono',
  preload: false,
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Roboto Mono', 'Menlo', 'Monaco', 'Liberation Mono', 'monospace'],
  weight: '100 900',
});
