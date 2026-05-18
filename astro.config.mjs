// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import remarkDirective from 'remark-directive';
import { remarkBlocks } from './src/lib/remarkBlocks.mjs';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  markdown: {
    remarkPlugins: [remarkDirective, remarkBlocks],
    shikiConfig: { theme: 'github-light' },
  },
});
