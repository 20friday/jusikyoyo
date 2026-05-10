import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    show: z.string(),
    hosts: z.array(z.string()),
    summary: z.string(),
    tags: z.array(z.string()).default([]),
    published: z.boolean().default(true),
  }),
});

export const collections = { posts };
