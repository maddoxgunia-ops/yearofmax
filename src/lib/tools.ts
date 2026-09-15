export interface Tool {
  /** URL segment under /tools/ */
  slug: string;
  name: string;
  summary: string;
}

export const TOOLS: Tool[] = [
  {
    slug: 'colour',
    name: 'colour',
    summary: 'pick, convert, compare.',
  },
  {
    slug: 'convert',
    name: 'convert',
    summary: 'units, measures, files.',
  },
];
