/** An entry is "now" for this many days after its date. */
export const RECENT_DAYS = 14;

const DAY_MS = 86_400_000;

/** Same three-letter set the year track uses, so the two never disagree. */
const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
] as const;

/** e.g. "13 sep 26" — derived from the entry date, not authored copy. */
export function formatDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const year = String(date.getUTCFullYear()).slice(-2);
  return `${day} ${month} ${year}`;
}

export function isRecent(date: Date, now: Date = new Date()): boolean {
  const delta = now.getTime() - date.getTime();
  return delta >= 0 && delta <= RECENT_DAYS * DAY_MS;
}

export function byDateDesc<T extends { data: { date: Date } }>(a: T, b: T): number {
  return b.data.date.getTime() - a.data.date.getTime();
}
