/**
 * Pointer tracer — a pencil line that follows the cursor and fades.
 *
 * `init()` is the only entry point and is idempotent, so it can be called on
 * every page load. It is wired to the `motion:ready` event rather than
 * `astro:page-load`, which means it inherits motion.ts's reduced-motion bail
 * for free: if motion is off the event never fires and no canvas is created.
 *
 * The line is redrawn in full each frame rather than faded by painting over
 * itself — compositing translucent paper on top leaves a permanent smear on a
 * light ground, and never quite reaches zero.
 */

interface Point {
  x: number;
  y: number;
  t: number;
  w: number;
}

/** How long a mark survives after it is laid down. */
const FADE_MS = 520;
/** Stroke width bounds, in CSS pixels. */
const WIDTH_MAX = 4;
const WIDTH_MIN = 1.1;
/** Above this speed (px/ms) the line is at its thinnest. */
const SPEED_FALLOFF = 0.85;
/** Cap on retained samples, so a fast sweep can't grow the buffer unbounded. */
const MAX_POINTS = 160;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let points: Point[] = [];
let frame = 0;
let ink = '#6E756D';

const teardown: Array<() => void> = [];

function on<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  fn: (event: WindowEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): void {
  target.addEventListener(type, fn as EventListener, opts);
  teardown.push(() => target.removeEventListener(type, fn as EventListener, opts));
}

function resize(): void {
  if (!canvas || !ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;

  // Resetting the bitmap clears context state, so re-apply it here.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function sample(x: number, y: number): void {
  const t = performance.now();
  const last = points[points.length - 1];

  let w = WIDTH_MAX;
  if (last) {
    const dist = Math.hypot(x - last.x, y - last.y);
    const dt = Math.max(t - last.t, 1);
    // A pencil dragged quickly deposits less graphite.
    w = Math.max(WIDTH_MIN, WIDTH_MAX - (dist / dt) * SPEED_FALLOFF);
  }

  points.push({ x, y, t, w });
  if (points.length > MAX_POINTS) points.shift();
}

function draw(): void {
  frame = requestAnimationFrame(draw);
  if (!ctx) return;

  const now = performance.now();
  while (points.length > 0 && now - points[0]!.t > FADE_MS) points.shift();

  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  if (points.length < 3) return;

  ctx.strokeStyle = ink;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const next = points[i + 1]!;

    const age = (now - curr.t) / FADE_MS;
    if (age >= 1) continue;

    // Ease the tail off faster than linear so the line lifts rather than dims.
    const alpha = (1 - age) ** 1.7;

    const from = { x: (prev.x + curr.x) / 2, y: (prev.y + curr.y) / 2 };
    const to = { x: (curr.x + next.x) / 2, y: (curr.y + next.y) / 2 };

    // Two passes: a soft wide halo and a darker core. Graphite is not a
    // uniform stroke, and the overlap is what reads as grain.
    ctx.globalAlpha = alpha * 0.22;
    ctx.lineWidth = curr.w;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(curr.x, curr.y, to.x, to.y);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.5;
    ctx.lineWidth = curr.w * 0.55;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(curr.x, curr.y, to.x, to.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

export function destroy(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;

  while (teardown.length > 0) teardown.pop()!();

  canvas?.remove();
  canvas = null;
  ctx = null;
  points = [];
}

export function init(): void {
  destroy();

  // No cursor to trace on a touch screen.
  if (!window.matchMedia('(pointer: fine)').matches) return;

  canvas = document.createElement('canvas');
  canvas.className = 'tracer';
  canvas.setAttribute('aria-hidden', 'true');

  const context = canvas.getContext('2d');
  if (!context) {
    canvas = null;
    return;
  }
  ctx = context;

  document.body.appendChild(canvas);

  // Take the colour from the design tokens so the two can't drift.
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue('--graphite')
    .trim();
  if (token) ink = token;

  resize();

  on(window, 'resize', resize);
  on(window, 'pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    sample(event.clientX, event.clientY);
  }, { passive: true });
  // Let the line run out rather than snapping off at the edge.
  on(window, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse') sample(event.clientX, event.clientY);
  }, { passive: true });

  frame = requestAnimationFrame(draw);
}
