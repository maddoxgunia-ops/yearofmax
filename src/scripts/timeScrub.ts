/**
 * Headless time scrubbing.
 *
 * Replaces the old drawn timeline: the wheel still walks through the year, but
 * nothing is rendered for it. Broadcasts `timeline:day` with both the whole
 * day (for the readout) and the exact fractional position — anything driving
 * Earth's rotation needs the fraction, since one whole day is one full turn.
 */

/** Pixels of scroll per day. */
const DAY_PX = 28;
const DAY_MS = 86_400_000;

let day = 1;
let attached = false;

function yearLength(): number {
  const year = new Date().getUTCFullYear();
  return Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS);
}

function today(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  const midnight = Date.UTC(year, now.getUTCMonth(), now.getUTCDate());
  return Math.round((midnight - start) / DAY_MS) + 1;
}

function broadcast(): void {
  const total = yearLength();
  document.dispatchEvent(new CustomEvent('timeline:day', {
    detail: { day: Math.min(total, Math.max(1, Math.round(day))), exact: day, total },
  }));
}

function move(deltaPx: number): void {
  const total = yearLength();
  const next = Math.min(total, Math.max(1, day + deltaPx / DAY_PX));
  if (Math.abs(next - day) < 0.001) return;
  day = next;
  broadcast();
}

export function init(): void {
  day = today();
  broadcast();

  if (attached) return;
  attached = true;

  window.addEventListener('wheel', (event) => {
    // Leave the wheel alone on anything that genuinely scrolls.
    if (document.documentElement.scrollHeight > window.innerHeight + 1) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    event.preventDefault();
    move(delta);
  }, { passive: false });

  window.addEventListener('keydown', (event) => {
    const tag = (event.target as Element | null)?.tagName ?? '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
    const step = event.shiftKey ? DAY_PX * 30 : DAY_PX * 7;
    if (event.key === 'ArrowRight') move(step);
    else if (event.key === 'ArrowLeft') move(-step);
    else return;
    event.preventDefault();
  });
}
