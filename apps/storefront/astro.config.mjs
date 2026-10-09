import { defineConfig } from 'astro/config';

// Static output: the landing page is HTML + CSS, with small script islands.
export default defineConfig({
  output: 'static',
  build: {
    // Keep the landing CSS in a file so it caches across pages.
    inlineStylesheets: 'never',
  },
});
