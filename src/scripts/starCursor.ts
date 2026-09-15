/**
 * Star cursor — a white spark that swells with pointer speed, blooms, and
 * throws lens ghosts along the axis through the centre of the screen.
 *
 * Additive compositing only works against a dark ground, so this is paired
 * with `data-ground="night"` and is never the cursor on the paper pages.
 *
 * Like the pencil tracer, it is wired to `motion:ready` and so inherits the
 * reduced-motion bail for free.
 */

interface Point { x: number; y: number }

/** Radius of the core at rest, and the most speed can add to it. */
const BASE = 2.6;
const SPEED_GAIN = 9;
/** How quickly the drawn position and size chase the real pointer. */
const EASE = 0.22;
const SPEED_EASE = 0.12;

/** Ghost positions as a fraction of the vector from the star to the centre. */
const GHOSTS: ReadonlyArray<{ at: number; scale: number; alpha: number; tint: string }> = [
  { at: 0.42, scale: 1.7, alpha: 0.05, tint: '190,205,255' },
  { at: 0.78, scale: 0.9, alpha: 0.07, tint: '255,225,200' },
  { at: 1.18, scale: 2.4, alpha: 0.035, tint: '210,235,255' },
  { at: 1.55, scale: 0.6, alpha: 0.06, tint: '255,245,220' },
];

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let frame = 0;

const target: Point = { x: -999, y: -999 };
const shown: Point = { x: -999, y: -999 };
let last: Point | null = null;
let lastAt = 0;
let speed = 0;
let shownSpeed = 0;
let seen = false;

const teardown: Array<() => void> = [];

function resize(): void {
  if (!canvas || !ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function bloom(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.08, 'rgba(255,255,255,0.30)');
  g.addColorStop(0.26, 'rgba(210,225,255,0.10)');
  g.addColorStop(1, 'rgba(190,210,255,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/** One arm of the star: a tapered streak, drawn as a gradient-filled diamond. */
function arm(c: CanvasRenderingContext2D, x: number, y: number, len: number, width: number, angle: number): void {
  c.save();
  c.translate(x, y);
  c.rotate(angle);
  const g = c.createLinearGradient(-len, 0, len, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-len, 0);
  c.lineTo(0, -width);
  c.lineTo(len, 0);
  c.lineTo(0, width);
  c.closePath();
  c.fill();
  c.restore();
}

function render(): void {
  frame = requestAnimationFrame(render);
  if (!ctx) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  ctx.clearRect(0, 0, w, h);
  if (!seen) return;

  // Chase the pointer rather than snapping to it, so fast movement stretches
  // the star out behind the cursor instead of teleporting.
  shown.x += (target.x - shown.x) * EASE;
  shown.y += (target.y - shown.y) * EASE;
  shownSpeed += (speed - shownSpeed) * SPEED_EASE;

  const size = BASE + Math.min(1, shownSpeed / 2.4) * SPEED_GAIN;
  const intensity = Math.min(1, 0.45 + shownSpeed / 3);

  ctx.globalCompositeOperation = 'lighter';

  // Lens ghosts first, along the line through the centre of the screen.
  const dx = w / 2 - shown.x;
  const dy = h / 2 - shown.y;
  for (const ghost of GHOSTS) {
    const gx = shown.x + dx * ghost.at;
    const gy = shown.y + dy * ghost.at;
    const gr = size * 2.4 * ghost.scale;
    const g = ctx.createRadialGradient(gx, gy, gr * 0.2, gx, gy, gr);
    g.addColorStop(0, `rgba(${ghost.tint},${ghost.alpha * intensity})`);
    g.addColorStop(0.7, `rgba(${ghost.tint},${ghost.alpha * intensity * 0.5})`);
    g.addColorStop(1, `rgba(${ghost.tint},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI * 2);
    ctx.fill();
  }

  bloom(ctx, shown.x, shown.y, size * 13);

  // Four-point star, with the horizontal arm longest — the anamorphic look.
  ctx.globalAlpha = intensity;
  arm(ctx, shown.x, shown.y, size * 11, size * 0.32, 0);
  arm(ctx, shown.x, shown.y, size * 6.5, size * 0.28, Math.PI / 2);
  ctx.globalAlpha = intensity * 0.4;
  arm(ctx, shown.x, shown.y, size * 3.6, size * 0.2, Math.PI / 4);
  arm(ctx, shown.x, shown.y, size * 3.6, size * 0.2, -Math.PI / 4);
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(shown.x, shown.y, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
}

export function destroy(): void {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  while (teardown.length > 0) teardown.pop()!();
  canvas?.remove();
  canvas = null;
  ctx = null;
  seen = false;
  last = null;
  speed = 0;
  shownSpeed = 0;
}

export function init(): void {
  destroy();

  if (!window.matchMedia('(pointer: fine)').matches) return;

  canvas = document.createElement('canvas');
  canvas.className = 'star-cursor';
  canvas.setAttribute('aria-hidden', 'true');

  const context = canvas.getContext('2d');
  if (!context) {
    canvas = null;
    return;
  }
  ctx = context;
  document.body.appendChild(canvas);
  resize();

  const onResize = (): void => resize();
  window.addEventListener('resize', onResize);
  teardown.push(() => window.removeEventListener('resize', onResize));

  const onMove = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    const now = performance.now();
    if (last) {
      const dist = Math.hypot(event.clientX - last.x, event.clientY - last.y);
      const dt = Math.max(now - lastAt, 1);
      speed = dist / dt; // px per ms
    }
    last = { x: event.clientX, y: event.clientY };
    lastAt = now;

    target.x = event.clientX;
    target.y = event.clientY;
    if (!seen) {
      shown.x = event.clientX;
      shown.y = event.clientY;
      seen = true;
    }
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  teardown.push(() => window.removeEventListener('pointermove', onMove));

  // Speed decays when the pointer stops, so the star settles rather than
  // staying swollen at its last velocity.
  const decay = window.setInterval(() => { speed *= 0.6; }, 60);
  teardown.push(() => window.clearInterval(decay));

  frame = requestAnimationFrame(render);
}
