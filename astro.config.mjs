// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import remarkDirective from 'remark-directive';
import { remarkBlocks } from './src/lib/remarkBlocks.mjs';

export default defineConfig({
  integrations: [react()],
  markdown: {
    remarkPlugins: [remarkDirective, remarkBlocks],
    shikiConfig: { theme: 'github-light' },
  },
});
