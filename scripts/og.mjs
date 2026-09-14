/**
 * Generates public/og.png (1200x630) from the design tokens.
 *
 *   node scripts/og.mjs   (or: npm run og)
 *
 * Nothing here is authored copy: the only text is the wordmark, drawn as
 * outlines rather than live text. resvg cannot apply variable-font axes, so
 * the wordmark is instanced with fontkit at wdth 125 / wght 700 first and
 * emitted as paths — which is what keeps it matching the site's display type.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { decompress } from 'wawoff2';
import * as fontkit from 'fontkit';

// --- tokens (mirrors src/styles/global.css) --------------------------------
const PAPER = '#E7E9E2';
const INK = '#141A18';

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 84; // 7% of 1200, matching --margin: 7vw

const WORDMARK = 'yearofmax';
const FONT_SIZE = 150;
const BASELINE = 355; // optical centre of the ink block, left-aligned

const WOFF2 = './node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2';

// --- wordmark as outlines ---------------------------------------------------
const ttf = Buffer.from(await decompress(readFileSync(WOFF2)));
const font = fontkit.create(ttf);
const instance = font.getVariation({ wght: 700, wdth: 125 });
const run = instance.layout(WORDMARK);

const scale = FONT_SIZE / font.unitsPerEm;

let pen = 0;
const glyphs = [];
run.glyphs.forEach((glyph, i) => {
  const { xAdvance, xOffset, yOffset } = run.positions[i];
  const d = glyph.path.toSVG();
  if (d) {
    glyphs.push(`<path transform="translate(${pen + xOffset} ${yOffset})" d="${d}"/>`);
  }
  pen += xAdvance;
});

// --- compose ----------------------------------------------------------------
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  <g fill="${INK}" transform="translate(${MARGIN} ${BASELINE}) scale(${scale} ${-scale})">${glyphs.join('')}</g>
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();

mkdirSync('public', { recursive: true });
writeFileSync('public/og.png', png);

console.log(
  `public/og.png  ${WIDTH}x${HEIGHT}  ${(png.length / 1024).toFixed(1)} KB  ` +
  `(wordmark wdth 125 / wght 700)`
);
