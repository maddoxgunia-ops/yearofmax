// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://yearofmax.co.uk',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  // The game moved under /games/; keep the old link alive.
  redirects: {
    '/chess': '/games/chess/',
  },
  integrations: [sitemap()],
});
