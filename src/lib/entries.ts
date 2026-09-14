/** An entry is "now" for this many days after its date. */
export const RECENT_DAYS = 14;

const DAY_MS = 86_400_000;

const FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

/** e.g. "14 sep 26" — derived from the entry date, not authored copy. */
export function formatDate(date: Date): string {
  return FORMATTER.format(date).toLowerCase();
}

export function isRecent(date: Date, now: Date = new Date()): boolean {
  const delta = now.getTime() - date.getTime();
  return delta >= 0 && delta <= RECENT_DAYS * DAY_MS;
}

export function byDateDesc<T extends { data: { date: Date } }>(a: T, b: T): number {
  return b.data.date.getTime() - a.data.date.getTime();
}
