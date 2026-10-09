import { defineConfig } from 'astro/config';

// Static output. Tracking pages are plain HTML + CSS with one tiny script.
export default defineConfig({
  output: 'static',
  build: { inlineStylesheets: 'never' },
});
