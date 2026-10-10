import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The kit starts DiffReview's worker with `new URL('./diff-worker.js', import.meta.url)`: left out
  // of dependency pre-bundling, `vite dev` serves that file as it is. `vite build` needs nothing.
  optimizeDeps: { exclude: ['signoff-ui'] },
  // assistant-ui, React and the kit in one chunk: fine for an example.
  build: { chunkSizeWarningLimit: 1000 },
});
