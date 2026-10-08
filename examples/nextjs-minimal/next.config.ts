import type { NextConfig } from 'next';

const config: NextConfig = {
  // The create-next-app defaults since Next.js 16.4. With cacheComponents, components must not read
  // the clock or random numbers while prerendering: app/static/page.tsx fails the build if one does.
  cacheComponents: true,
  partialPrefetching: true,
};

export default config;
