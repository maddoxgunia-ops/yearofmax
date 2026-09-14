/**
 * Prepares the RUSH screenshots for the web.
 *
 *   node scripts/images.mjs        (or: npm run images)
 *
 * Sources are the raw Roblox captures, which live outside this repo; the
 * committed .webp files are the output. Override with:
 *   node scripts/images.mjs <gameplay.png> <wordmark.png>
 *
 * Both captures carry the Roblox chrome at rows 12-55, x 0-215, and neither
 * can simply be cropped: on the gameplay shot that band is shared with the
 * game's own timer (14-47) and mode line (52-72) while the standings panel
 * starts at row 65, so any horizontal cut that clears the chrome also slices
 * game UI. Instead the chrome is covered with the pixels immediately to its
 * right, mirrored so the join is continuous. Both frames stay 16:9.
 */
import sharp from 'sharp';

const SRC = 'D:/PDATA/Projects/Games/RUSH/Roblox';
const gameplaySrc = process.argv[2] ?? `${SRC}/Screenshot 2026-09-15 001746.png`;
const wordmarkSrc = process.argv[3] ?? `${SRC}/Screenshot 2026-09-15 001835.png`;

const OUT = 'public/projects/rush';
const WIDTH = 1600;
const QUALITY = 82;
const PATCH_W = 215;
const PATCH_H = 64;

/** Cover the Roblox chrome with a mirrored copy of the area beside it. */
async function dechrome(src, outName) {
  const patch = await sharp(src)
    .extract({ left: PATCH_W, top: 0, width: PATCH_W, height: PATCH_H })
    .flop() // the patch's right edge is the pixel the original has at that x
    .toBuffer();

  return sharp(src)
    .composite([{ input: patch, left: 0, top: 0 }])
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(`${OUT}/${outName}`);
}

// wordmark → the block plate on /projects/ (already 16:9, no crop needed)
const wordmark = await dechrome(wordmarkSrc, 'wordmark.webp');

// gameplay → the image on the project's own page
const gameplay = await dechrome(gameplaySrc, 'gameplay.webp');

console.log(`wordmark.webp  ${wordmark.width}x${wordmark.height}  ${(wordmark.size / 1024).toFixed(0)} KB  -> block`);
console.log(`gameplay.webp  ${gameplay.width}x${gameplay.height}  ${(gameplay.size / 1024).toFixed(0)} KB  -> detail page`);
