/**
 * Fetches the Earth texture set and re-encodes it to WebP for the web.
 *
 *   node scripts/earth-textures.mjs   (or: npm run earth)
 *
 * Source: the three.js repository's planet textures, which are derived from
 * NASA's Blue Marble and Black Marble imagery and are public domain. The
 * committed files under public/earth/ are the output; the originals are not
 * kept in the repo.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets';
const OUT = 'public/earth';

const TEXTURES = [
  // Daytime colour. Carries the most visual weight, so it keeps the quality.
  { src: 'earth_atmos_2048.jpg', out: 'day.webp', width: 2048, quality: 82 },
  // Night lights, blended in on the dark side of the terminator.
  { src: 'earth_lights_2048.png', out: 'night.webp', width: 2048, quality: 78 },
  // Cloud layer. Stored as luminance on black rather than with an alpha
  // channel — alpha roughly triples the file for no visual gain, and the
  // shader reads the red channel as coverage instead.
  { src: 'earth_clouds_1024.png', out: 'clouds.webp', width: 1024, quality: 76, mono: true },
  // Water mask for the ocean glint. Near-binary, so it survives hard squeezing.
  { src: 'earth_specular_2048.jpg', out: 'water.webp', width: 1024, quality: 68 },
  // Terrain relief.
  { src: 'earth_normal_2048.jpg', out: 'normal.webp', width: 2048, quality: 78 },
];

await mkdir(OUT, { recursive: true });

let total = 0;
for (const texture of TEXTURES) {
  const response = await fetch(`${BASE}/${texture.src}`);
  if (!response.ok) throw new Error(`${texture.src}: HTTP ${response.status}`);
  const raw = Buffer.from(await response.arrayBuffer());

  let pipeline = sharp(raw).resize({ width: texture.width, withoutEnlargement: true });
  if (texture.mono) pipeline = pipeline.flatten({ background: "#000" }).greyscale();
  const encoded = await pipeline
    .webp({ quality: texture.quality, alphaQuality: texture.alpha ? 90 : 100 })
    .toBuffer();

  await writeFile(`${OUT}/${texture.out}`, encoded);
  total += encoded.length;
  console.log(
    texture.out.padEnd(12),
    `${(raw.length / 1024).toFixed(0)} KB`.padStart(9),
    '->',
    `${(encoded.length / 1024).toFixed(0)} KB`.padStart(8),
  );
}

console.log(`\ntotal ${(total / 1024).toFixed(0)} KB`);
