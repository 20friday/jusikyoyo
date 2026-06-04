// @ts-check
import { defineConfig, envField } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import remarkDirective from 'remark-directive';
import { remarkBlocks } from './src/lib/remarkBlocks.mjs';

export default defineConfig({
  output: 'server',
  adapter: vercel({
    edgeMiddleware: false,
    functionPerRoute: false,
  }),
  integrations: [react()],
  markdown: {
    remarkPlugins: [remarkDirective, remarkBlocks],
    shikiConfig: { theme: 'github-light' },
  },
  env: {
    schema: {
      ANTHROPIC_API_KEY: envField.string({ context: 'server', access: 'secret' }),
    },
  },
  vite: {
    ssr: {
      // process.env가 번들링 시 빈 객체로 교체되지 않도록
      external: [],
    },
    // 서버 번들에서 process.env 보존
    define: {
      'process.env': 'process.env',
    },
  },
});
