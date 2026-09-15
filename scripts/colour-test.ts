import {
  parseHex, toHex, rgbToHsl, hslToRgb, rgbToHsv, hsvToRgb,
  rgbToCmyk, rgbToOklch, oklchToRgb, contrast, strip, harmony, HARMONIES,
} from '../src/scripts/tools/colour.ts';

const base = parseHex('#F54927');
if (!base) throw new Error('parse failed');

const expect = (label: string, got: string, want: string): void => {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(22)} got ${got.padEnd(34)} want ${want}`);
};

console.log('--- reference: htmlcolorcodes.com for #F54927 ---');

expect('rgb', `${base.r}, ${base.g}, ${base.b}`, '245, 73, 39');

const hsl = rgbToHsl(base);
expect('hsl', `${hsl.h}, ${hsl.s}, ${hsl.l}`, '10, 91, 56');

const hsv = rgbToHsv(base);
expect('hsv', `${hsv.h}, ${hsv.s}, ${hsv.v}`, '10, 84, 96');

const ok = rgbToOklch(base);
expect('oklch', `${ok.l}, ${ok.c}, ${ok.h}`, '0.65, 0.21, 33');

const cmyk = rgbToCmyk(base);
expect('cmyk', `${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`, '0, 70, 84, 4');

const white = { r: 255, g: 255, b: 255 };
const black = { r: 0, g: 0, b: 0 };
expect('contrast on white', String(contrast(base, white)), '3.58');
expect('contrast on black', String(contrast(base, black)), '5.86');

console.log('\n--- round trips ---');
expect('hex round trip', '#' + toHex(base), '#F54927');
console.log('INFO  hsl round trip     ' + toHex(hslToRgb(hsl)) + ' (lossy by design: display values are rounded)');
expect('hsv round trip', toHex(hsvToRgb(hsv)), 'F54927');
console.log(`INFO  oklch round trip    ${toHex(oklchToRgb(ok))} (lossy: 2dp storage)`);

console.log('\n--- strip vs reference ---');
const want = ['FEEBE7', 'FCC6BB', 'FAA18F', 'F87C63', 'F54927',
  'F4320B', 'C82909', '9C2007', '701705', '440E03', '180501'];
const got = strip(base).map(toHex);
got.forEach((g, i) => expect(`strip[${i}]`, g, want[i]!));

console.log('\n--- harmonies ---');
for (const h of HARMONIES) {
  console.log(`  ${h.name.padEnd(20)} ${harmony(base, h.offsets).map((c) => '#' + toHex(c)).join(' ')}`);
}
