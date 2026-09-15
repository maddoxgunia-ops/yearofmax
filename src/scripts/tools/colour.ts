/**
 * Colour maths. Pure functions, no dependencies, no DOM.
 *
 * Conversion between sRGB / HSL / HSV / OKLCH / CMYK, WCAG contrast,
 * harmonies, variation ramps, a Tailwind-style scale and colour-vision
 * simulation.
 */

export interface RGB { r: number; g: number; b: number }
export interface HSL { h: number; s: number; l: number }
export interface HSV { h: number; s: number; v: number }
export interface OKLCH { l: number; c: number; h: number }
export interface CMYK { c: number; m: number; y: number; k: number }

const clamp = (n: number, min = 0, max = 1): number => Math.min(max, Math.max(min, n));

const round = (n: number, dp = 0): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/* ------------------------------------------------------------------ hex -- */

export function parseHex(input: string): RGB | null {
  let h = input.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function toHex(rgb: RGB): string {
  const pair = (n: number): string =>
    Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return (pair(rgb.r) + pair(rgb.g) + pair(rgb.b)).toUpperCase();
}

/* ------------------------------------------------------------------ hsl -- */

function hueOf(rn: number, gn: number, bn: number, max: number, d: number): number {
  if (d === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/**
 * Unrounded, for internal maths. Rounding to whole degrees and percent before
 * converting back shifts the colour — #F54927 returns as #F54B29 — which would
 * put the wrong base swatch at the head of every harmony.
 */
export function rgbToHslExact(rgb: RGB): HSL {
  const rn = rgb.r / 255, gn = rgb.g / 255, bn = rgb.b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hueOf(rn, gn, bn, max, d), s: s * 100, l: l * 100 };
}

/** Rounded, for display. */
export function rgbToHsl(rgb: RGB): HSL {
  const { h, s, l } = rgbToHslExact(rgb);
  return { h: round(h), s: round(s), l: round(l) };
}

function fromChroma(hp: number, c: number, x: number, m: number): RGB {
  let t: [number, number, number];
  if (hp < 1) t = [c, x, 0];
  else if (hp < 2) t = [x, c, 0];
  else if (hp < 3) t = [0, c, x];
  else if (hp < 4) t = [0, x, c];
  else if (hp < 5) t = [x, 0, c];
  else t = [c, 0, x];
  return {
    r: Math.round((t[0] + m) * 255),
    g: Math.round((t[1] + m) * 255),
    b: Math.round((t[2] + m) * 255),
  };
}

export function hslToRgb(hsl: HSL): RGB {
  const sn = hsl.s / 100, ln = hsl.l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((hsl.h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  return fromChroma(hp, c, x, ln - c / 2);
}

/* ------------------------------------------------------------------ hsv -- */

export function rgbToHsv(rgb: RGB): HSV {
  const rn = rgb.r / 255, gn = rgb.g / 255, bn = rgb.b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  return {
    h: round(hueOf(rn, gn, bn, max, d)),
    s: round((max === 0 ? 0 : d / max) * 100),
    v: round(max * 100),
  };
}

export function hsvToRgb(hsv: HSV): RGB {
  const sn = hsv.s / 100, vn = hsv.v / 100;
  const c = vn * sn;
  const hp = (((hsv.h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  return fromChroma(hp, c, x, vn - c);
}

/* ----------------------------------------------------------------- cmyk -- */

export function rgbToCmyk(rgb: RGB): CMYK {
  const rn = rgb.r / 255, gn = rgb.g / 255, bn = rgb.b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: round(((1 - rn - k) / (1 - k)) * 100),
    m: round(((1 - gn - k) / (1 - k)) * 100),
    y: round(((1 - bn - k) / (1 - k)) * 100),
    k: round(k * 100),
  };
}

/* ---------------------------------------------------------------- oklch -- */

const toLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

const fromLinear = (c: number): number =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

export function rgbToOklchExact(rgb: RGB): OKLCH {
  const lr = toLinear(rgb.r / 255);
  const lg = toLinear(rgb.g / 255);
  const lb = toLinear(rgb.b / 255);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;

  return { l: L, c: Math.hypot(A, B), h };
}

/** Rounded, for display. Do not feed this back into oklchToRgb. */
export function rgbToOklch(rgb: RGB): OKLCH {
  const { l, c, h } = rgbToOklchExact(rgb);
  return { l: round(l, 2), c: round(c, 2), h: round(h) };
}

export function oklchToRgb(oklch: OKLCH): RGB {
  const hr = (oklch.h * Math.PI) / 180;
  const A = oklch.c * Math.cos(hr);
  const B = oklch.c * Math.sin(hr);

  const l_ = (oklch.l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (oklch.l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (oklch.l - 0.0894841775 * A - 1.2914855480 * B) ** 3;

  const lr = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const lg = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const lb = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_;

  return {
    r: Math.round(clamp(fromLinear(lr)) * 255),
    g: Math.round(clamp(fromLinear(lg)) * 255),
    b: Math.round(clamp(fromLinear(lb)) * 255),
  };
}

/* -------------------------------------------------------------- contrast -- */

export function luminance(rgb: RGB): number {
  return 0.2126 * toLinear(rgb.r / 255)
    + 0.7152 * toLinear(rgb.g / 255)
    + 0.0722 * toLinear(rgb.b / 255);
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return round((hi + 0.05) / (lo + 0.05), 2);
}

export interface Wcag {
  smallAA: boolean;
  smallAAA: boolean;
  largeAA: boolean;
  largeAAA: boolean;
  ui: boolean;
}

export function wcag(ratio: number): Wcag {
  return {
    smallAA: ratio >= 4.5,
    smallAAA: ratio >= 7,
    largeAA: ratio >= 3,
    largeAAA: ratio >= 4.5,
    // WCAG defines no AAA tier for non-text contrast.
    ui: ratio >= 3,
  };
}

/* ------------------------------------------------------------- harmonies -- */

export const HARMONIES: ReadonlyArray<{ name: string; offsets: number[] }> = [
  { name: 'analogous', offsets: [-30, 0, 30] },
  { name: 'complementary', offsets: [0, 180] },
  { name: 'split complementary', offsets: [0, 150, 210] },
  { name: 'triadic', offsets: [0, 120, 240] },
  { name: 'tetradic', offsets: [0, 60, 180, 240] },
  { name: 'square', offsets: [0, 90, 180, 270] },
];

export function harmony(base: RGB, offsets: number[]): RGB[] {
  const hsl = rgbToHslExact(base);
  return offsets.map((o) =>
    (o % 360 === 0 ? base : hslToRgb({ h: (hsl.h + o + 360) % 360, s: hsl.s, l: hsl.l })));
}

/* ------------------------------------------------------------ variations -- */

const mix = (a: RGB, b: RGB, t: number): RGB => ({
  r: Math.round(a.r + (b.r - a.r) * t),
  g: Math.round(a.g + (b.g - a.g) * t),
  b: Math.round(a.b + (b.b - a.b) * t),
});

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };
const GREY: RGB = { r: 128, g: 128, b: 128 };

const series = (base: RGB, towards: RGB, steps: number): RGB[] =>
  Array.from({ length: steps }, (_, i) => mix(base, towards, (i + 1) / (steps + 1)));

export const shades = (base: RGB, steps = 10): RGB[] => series(base, BLACK, steps);
export const tints = (base: RGB, steps = 10): RGB[] => series(base, WHITE, steps);
export const tones = (base: RGB, steps = 10): RGB[] => series(base, GREY, steps);

/**
 * The header strip. Eleven HSL lightness stops from 95 down to 5, with the
 * stop nearest the base's own lightness replaced by the base itself.
 *
 * Not an RGB mix towards white and black — that produces a visibly different
 * and muddier ramp. Verified against the reference tool: #F54927 yields
 * FEEBE7 FCC6BB FAA18F F87C63 F54927 F4320B C82909 9C2007 701705 440E03 180501.
 */
const STRIP_L = [95, 86, 77, 68, 59, 50, 41, 32, 23, 14, 5];

export function strip(base: RGB): RGB[] {
  // Rounded on purpose: the ramp is a lightness sweep of the HSL shown in the
  // readout, so it stays consistent with what is on screen. Using unrounded
  // values shifts the lightest stop by one count of green.
  const hsl = rgbToHsl(base);
  let nearest = 0;
  STRIP_L.forEach((l, i) => {
    if (Math.abs(l - hsl.l) < Math.abs((STRIP_L[nearest] ?? 0) - hsl.l)) nearest = i;
  });
  return STRIP_L.map((l, i) =>
    (i === nearest ? base : hslToRgb({ h: hsl.h, s: hsl.s, l })));
}

/* -------------------------------------------------------------- tailwind -- */

export const TAILWIND_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;

/** Perceptual lightness targets, held in OKLCH so the ramp reads evenly. */
const TAILWIND_L = [0.97, 0.94, 0.88, 0.81, 0.73, 0.65, 0.58, 0.5, 0.42, 0.35, 0.26];

export function tailwind(base: RGB): RGB[] {
  const { c, h } = rgbToOklchExact(base);
  return TAILWIND_L.map((l) => {
    // Chroma cannot hold at the extremes without leaving the sRGB gamut.
    const falloff = 1 - Math.abs(l - 0.62) / 0.62;
    return oklchToRgb({ l, c: c * Math.max(0.25, falloff), h });
  });
}

/* ---------------------------------------------------------------- vision -- */

export const VISION = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const;
export type Vision = (typeof VISION)[number];

const MATRIX: Record<Vision, number[]> = {
  protanopia: [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  deuteranopia: [0.625, 0.375, 0, 0.7, 0.3, 0, 0, 0.3, 0.7],
  tritanopia: [0.95, 0.05, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
  achromatopsia: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114],
};

export function simulate(rgb: RGB, type: Vision): RGB {
  const m = MATRIX[type];
  const at = (i: number): number => m[i] ?? 0;
  return {
    r: Math.round(clamp(at(0) * rgb.r + at(1) * rgb.g + at(2) * rgb.b, 0, 255)),
    g: Math.round(clamp(at(3) * rgb.r + at(4) * rgb.g + at(5) * rgb.b, 0, 255)),
    b: Math.round(clamp(at(6) * rgb.r + at(7) * rgb.g + at(8) * rgb.b, 0, 255)),
  };
}

/* ---------------------------------------------------------------- random -- */

export function randomRgb(): RGB {
  return hslToRgb({
    h: Math.floor(Math.random() * 360),
    s: 45 + Math.floor(Math.random() * 45),
    l: 35 + Math.floor(Math.random() * 35),
  });
}

/* ---------------------------------------------------------------- export -- */

export function asCss(name: string, colours: RGB[]): string {
  const lines = colours.map((c, i) => '  --' + name + '-' + ((i + 1) * 100) + ': #' + toHex(c) + ';');
  return ':root {\n' + lines.join('\n') + '\n}';
}

export function asList(colours: RGB[]): string {
  return colours.map((c) => '#' + toHex(c)).join('\n');
}

export function asJson(name: string, colours: RGB[]): string {
  return JSON.stringify({ [name]: colours.map((c) => '#' + toHex(c)) }, null, 2);
}
