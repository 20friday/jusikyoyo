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
    order: z.number().optional(),
  }),
});

const reports = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/reports' }),
  schema: z.object({
    date: z.string(),
    headline: z.string(),
    shows: z.array(z.string()),
    stocks: z.array(z.object({
      name: z.string(),
      shows: z.array(z.string()),
      notes: z.array(z.object({
        show: z.string(),
        view: z.string(),
      })).optional(),
    })),
    comparisons: z.array(z.object({
      stock: z.string(),
      points: z.array(z.object({
        show: z.string(),
        view: z.string(),
      })),
      pick: z.string(),
    })),
    sectors: z.array(z.object({
      name: z.string(),
      flow: z.string(),
    })),
    insight: z.string(),
  }),
});

export const collections = { posts, reports };
