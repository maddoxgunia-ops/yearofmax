import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { byDateDesc } from '../lib/entries';

export async function GET(context: APIContext) {
  if (!context.site) {
    throw new Error('`site` must be set in astro.config.mjs to build the feed.');
  }

  const entries = (await getCollection('log', ({ data }) => !data.draft)).sort(byDateDesc);

  return rss({
    // Feed copy pending — see the list of strings handed back at Step 8.
    title: '',
    description: '',
    site: context.site,
    trailingSlash: true,
    items: entries.map((entry) => ({
      title: entry.data.title,
      description: entry.data.summary,
      pubDate: entry.data.date,
      link: `/log/${entry.id}/`,
      categories: entry.data.tags,
    })),
  });
}
