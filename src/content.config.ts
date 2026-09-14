import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const shared = {
  title: z.string(),
  date: z.coerce.date(),
  summary: z.string(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
};

const log = defineCollection({
  loader: glob({ base: './src/content/log', pattern: '**/*.md' }),
  schema: z.object(shared),
});

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: z.object({
    ...shared,
    status: z.enum(['building', 'shipped', 'archived']),
    url: z.string().url().optional(),
  }),
});

export const collections = { log, projects };
