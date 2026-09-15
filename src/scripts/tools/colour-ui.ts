/**
 * Wiring for the colour tool.
 *
 * The page's structure is rendered by Astro at build time and never rebuilt
 * here — this only writes values into nodes that already exist. That keeps the
 * no-JavaScript page identical in shape to the interactive one, and means a
 * missing element degrades one control rather than the whole tool.
 */
import * as C from './colour';

type El = HTMLElement;

let rgb: C.RGB = { r: 216, g: 63, b: 70 };
let root: El | null = null;

const q = <T extends Element = El>(sel: string, scope: ParentNode = document): T | null =>
  scope.querySelector<T>(sel);
const all = <T extends Element = El>(sel: string, scope: ParentNode = document): T[] =>
  Array.from(scope.querySelectorAll<T>(sel));

/* ------------------------------------------------------------- clipboard -- */

/** Pre-async-clipboard fallback; also covers permission-denied contexts. */
function legacyCopy(text: string): boolean {
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(box);
  box.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  box.remove();
  return ok;
}

async function copy(text: string, button?: El): Promise<void> {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = legacyCopy(text);
  }

  if (!button) return;
  const was = button.textContent;
  // Report the failure rather than showing a success that did not happen.
  button.textContent = ok ? 'copied' : 'blocked';
  window.setTimeout(() => { button.textContent = was; }, 900);
}

/* ---------------------------------------------------------------- render -- */

function paint(list: El[], colours: C.RGB[], labels?: string[]): void {
  list.forEach((node, i) => {
    const c = colours[i];
    if (!c) return;
    const hex = C.toHex(c);
    node.style.background = '#' + hex;
    node.dataset.sw = hex;
    const tag = q('.sw__hex', node);
    if (tag) tag.textContent = labels?.[i] ?? hex;
  });
}

function render(): void {
  if (!root) return;

  const hex = C.toHex(rgb);
  const hsl = C.rgbToHsl(rgb);
  const hsv = C.rgbToHsv(rgb);
  const oklch = C.rgbToOklch(rgb);
  const cmyk = C.rgbToCmyk(rgb);

  const hexNode = q('[data-hex]', root);
  if (hexNode) hexNode.textContent = '#' + hex;

  const formats = q('[data-formats]', root);
  if (formats) {
    formats.textContent =
      `rgb(${rgb.r} ${rgb.g} ${rgb.b}) · hsl(${hsl.h} ${hsl.s}% ${hsl.l}%) · oklch(${oklch.l} ${oklch.c} ${oklch.h})`;
  }

  // strip
  const steps = all('[data-strip] .strip__step', root);
  C.strip(rgb).forEach((c, i) => {
    const node = steps[i];
    if (!node) return;
    const h = C.toHex(c);
    node.style.background = '#' + h;
    node.dataset.step = h;
  });

  // picker
  const field = q('[data-field]', root);
  if (field) {
    field.style.setProperty('--hue', String(hsl.h));
    field.setAttribute('aria-valuenow', String(hsv.s));
  }
  const handle = q('[data-handle]', root);
  if (handle) {
    handle.style.left = hsv.s + '%';
    handle.style.top = (100 - hsv.v) + '%';
  }
  const hueBar = q('[data-hue]', root);
  if (hueBar) hueBar.setAttribute('aria-valuenow', String(hsl.h));
  const hueHandle = q('[data-hue-handle]', root);
  if (hueHandle) hueHandle.style.left = ((hsl.h / 360) * 100) + '%';

  const input = q<HTMLInputElement>('[data-input]', root);
  if (input && document.activeElement !== input) input.value = hex;

  // harmonies
  for (const h of C.HARMONIES) {
    const set = q(`[data-harmony="${h.name}"]`, root);
    if (set) paint(all('.sw', set), C.harmony(rgb, h.offsets));
  }

  // variations
  const variations: Array<[string, C.RGB[], string[] | undefined]> = [
    ['tailwind', C.tailwind(rgb), C.TAILWIND_STEPS.map(String)],
    ['shades', C.shades(rgb), undefined],
    ['tints', C.tints(rgb), undefined],
    ['tones', C.tones(rgb), undefined],
  ];
  for (const [name, colours, labels] of variations) {
    const set = q(`[data-variation="${name}"]`, root);
    if (set) paint(all('.sw', set), colours, labels);
  }

  // convert
  const rows: Record<string, [string, string]> = {
    hex: [hex, '#' + hex],
    rgb: [`${rgb.r}, ${rgb.g}, ${rgb.b}`, `rgb(${rgb.r} ${rgb.g} ${rgb.b})`],
    hsl: [`${hsl.h}, ${hsl.s}, ${hsl.l}`, `hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`],
    hsv: [`${hsv.h}, ${hsv.s}, ${hsv.v}`, `hsv(${hsv.h} ${hsv.s}% ${hsv.v}%)`],
    oklch: [`${oklch.l}, ${oklch.c}, ${oklch.h}`, `oklch(${oklch.l} ${oklch.c} ${oklch.h})`],
    cmyk: [`${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`, `cmyk(${cmyk.c}% ${cmyk.m}% ${cmyk.y}% ${cmyk.k}%)`],
  };
  for (const [fmt, [raw, css]] of Object.entries(rows)) {
    const tr = q(`[data-fmt="${fmt}"]`, root);
    if (!tr) continue;
    const rawCell = q('[data-raw]', tr);
    if (rawCell) rawCell.textContent = raw;
    const cssBtn = q('[data-css]', tr);
    if (cssBtn) {
      cssBtn.textContent = css;
      cssBtn.dataset.copy = css;
    }
  }

  // contrast
  const grounds: Record<string, C.RGB> = {
    white: { r: 255, g: 255, b: 255 },
    black: { r: 0, g: 0, b: 0 },
    paper: C.parseHex('#E7E9E2') ?? { r: 231, g: 233, b: 226 },
    ink: C.parseHex('#141A18') ?? { r: 20, g: 26, b: 24 },
  };
  for (const [name, ground] of Object.entries(grounds)) {
    const tr = q(`[data-ground="${name}"]`, root);
    if (!tr) continue;
    const ratio = C.contrast(rgb, ground);
    const w = C.wcag(ratio);
    const set = (sel: string, text: string): void => {
      const cell = q(sel, tr);
      if (cell) cell.textContent = text;
    };
    set('[data-ratio]', ratio + ':1');
    set('[data-small]', w.smallAAA ? 'AAA' : w.smallAA ? 'AA' : '—');
    set('[data-large]', w.largeAAA ? 'AAA' : w.largeAA ? 'AA' : '—');
    set('[data-ui]', w.ui ? 'AA' : '—');
  }

  // vision
  for (const v of C.VISION) {
    const node = q(`[data-vision="${v}"]`, root);
    if (!node) continue;
    const hexSim = C.toHex(C.simulate(rgb, v));
    node.style.background = '#' + hexSim;
    node.dataset.sw = hexSim;
  }

  // copy-hex button and the address bar
  const copyHex = q('[data-copy][data-copy^="#"]', root);
  if (copyHex) copyHex.dataset.copy = '#' + hex;

  const url = new URL(window.location.href);
  url.hash = hex;
  window.history.replaceState(null, '', url.toString());
}

function set(next: C.RGB): void {
  rgb = next;
  render();
}

/* ---------------------------------------------------------------- inputs -- */

/** Drag handling shared by the saturation field and the hue bar. */
function draggable(node: El, onMove: (x: number, y: number) => void): void {
  const handle = (event: PointerEvent): void => {
    const box = node.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    onMove(x, y);
  };

  node.addEventListener('pointerdown', (event) => {
    node.setPointerCapture(event.pointerId);
    handle(event);
  });
  node.addEventListener('pointermove', (event) => {
    if (event.buttons !== 1) return;
    handle(event);
  });
}

function keyable(node: El, step: (delta: number, big: boolean) => void): void {
  node.addEventListener('keydown', (event) => {
    const big = event.shiftKey;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') step(1, big);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') step(-1, big);
    else return;
    event.preventDefault();
  });
}

/* ------------------------------------------------------------------ init -- */

export function init(): void {
  root = q('[data-colour-tool]');
  if (!root || root.dataset.wired === 'yes') return;
  root.dataset.wired = 'yes';

  // A hash wins over the build-time default, so a colour is shareable.
  const fromHash = C.parseHex(window.location.hash.slice(1));
  const fromData = C.parseHex(root.dataset.start ?? '');
  rgb = fromHash ?? fromData ?? rgb;

  const field = q('[data-field]', root);
  if (field) {
    draggable(field, (x, y) => {
      const { h } = C.rgbToHsl(rgb);
      set(C.hsvToRgb({ h, s: x * 100, v: (1 - y) * 100 }));
    });
    keyable(field, (d, big) => {
      const hsv = C.rgbToHsv(rgb);
      set(C.hsvToRgb({ ...hsv, s: Math.min(100, Math.max(0, hsv.s + d * (big ? 10 : 1))) }));
    });
  }

  const hueBar = q('[data-hue]', root);
  if (hueBar) {
    draggable(hueBar, (x) => {
      const hsv = C.rgbToHsv(rgb);
      set(C.hsvToRgb({ ...hsv, h: x * 360 }));
    });
    keyable(hueBar, (d, big) => {
      const hsv = C.rgbToHsv(rgb);
      set(C.hsvToRgb({ ...hsv, h: (hsv.h + d * (big ? 10 : 1) + 360) % 360 }));
    });
  }

  const input = q<HTMLInputElement>('[data-input]', root);
  input?.addEventListener('input', () => {
    const parsed = C.parseHex(input.value);
    if (parsed) set(parsed);
  });

  q('[data-random]', root)?.addEventListener('click', () => set(C.randomRgb()));

  // EyeDropper is Chrome/Edge only; hide rather than offer a dead control.
  const sample = q('[data-sample]', root);
  if (sample && 'EyeDropper' in window) {
    sample.hidden = false;
    sample.addEventListener('click', async () => {
      try {
        const Picker = (window as unknown as {
          EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> };
        }).EyeDropper;
        const result = await new Picker().open();
        const picked = C.parseHex(result.sRGBHex);
        if (picked) set(picked);
      } catch {
        /* cancelled */
      }
    });
  }

  // One delegated listener covers every swatch, step, copy and export button.
  // A hash-only change does not reload the page or fire astro:page-load, so
  // pasting a new #hex into the address bar has to be picked up separately.
  window.addEventListener('hashchange', () => {
    const next = C.parseHex(window.location.hash.slice(1));
    if (next && C.toHex(next) !== C.toHex(rgb)) set(next);
  });

  root.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-sw], [data-step], [data-copy], [data-export]',
    );
    if (!target) return;

    if (target.dataset.export) {
      const name = target.dataset.export;
      const as = target.dataset.as ?? 'list';
      const set_ = q(`[data-harmony="${name}"], [data-variation="${name}"]`, root!);
      if (!set_) return;
      const colours = all('.sw', set_)
        .map((s) => C.parseHex(s.dataset.sw ?? ''))
        .filter((c): c is C.RGB => c !== null);
      const slug = name.replace(/\s+/g, '-');
      const text = as === 'css' ? C.asCss(slug, colours)
        : as === 'json' ? C.asJson(slug, colours)
        : C.asList(colours);
      void copy(text, target);
      return;
    }

    if (target.dataset.copy) {
      void copy(target.dataset.copy, target);
      return;
    }

    const picked = C.parseHex(target.dataset.sw ?? target.dataset.step ?? '');
    if (picked) set(picked);
  });

  render();
}
