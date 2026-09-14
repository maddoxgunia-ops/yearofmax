// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://yearofmax.co.uk',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});