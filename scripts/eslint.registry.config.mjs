// The ESLint config of a new Next.js app (create-next-app: core-web-vitals and typescript), for
// `pnpm lint:registry`. The shadcn registry copies the library's source into apps, which often
// lint with --max-warnings=0, so those files must pass that config without a warning, including
// for disable comments that it reports as unused.
import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // The app the files would land in, for the rules that look for a pages/ or app/ directory.
  { settings: { next: { rootDir: 'examples/nextjs-minimal' } } },
]);
