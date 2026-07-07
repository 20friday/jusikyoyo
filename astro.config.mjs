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
  // 개발 서버 포트: 하니스가 지정한 PORT 환경변수를 우선 사용, 없으면 기본 4321
  server: { port: process.env.PORT ? Number(process.env.PORT) : 4321 },
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
