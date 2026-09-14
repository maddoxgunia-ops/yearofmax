/**
 * Prepares the RUSH screenshots for the web.
 *
 *   node scripts/images.mjs        (or: npm run images)
 *
 * Sources are the raw Roblox captures, which live outside this repo; the
 * committed .webp files are the output. Override with:
 *   node scripts/images.mjs <cover.png> <splash.png>
 *
 * The cover cannot simply be cropped. The Roblox chrome occupies rows 12-55,
 * and that band is shared with the game's own timer (14-47) and mode line
 * (52-72), while the standings panel starts at row 65 — so every horizontal
 * cut that clears the chrome also slices game UI. Instead the chrome is
 * covered with the sky immediately to its right, mirrored so the join is
 * seamless. No game HUD is lost. The splash has empty space around the
 * wordmark and crops cleanly.
 */
import sharp from 'sharp';

const SRC = 'D:/PDATA/Projects/Games/RUSH/Roblox';
const coverSrc = process.argv[2] ?? `${SRC}/Screenshot 2026-09-15 001746.png`;
const splashSrc = process.argv[3] ?? `${SRC}/Screenshot 2026-09-15 001835.png`;

const OUT = 'public/projects/rush';
const WIDTH = 1600;
const QUALITY = 82;

// ---- cover: mirror the adjacent sky over the Roblox chrome ----------------
const PATCH_W = 215;
const PATCH_H = 64;

const sky = await sharp(coverSrc)
  .extract({ left: PATCH_W, top: 0, width: PATCH_W, height: PATCH_H })
  .flop() // so the patch's right edge is the pixel the original has at that x
  .toBuffer();

const cover = await sharp(coverSrc)
  .composite([{ input: sky, left: 0, top: 0 }])
  .resize({ width: WIDTH, withoutEnlargement: true })
  .webp({ quality: QUALITY })
  .toFile(`${OUT}/cover.webp`);

// ---- splash: crop to the content band ------------------------------------
const meta = await sharp(splashSrc).metadata();

const splash = await sharp(splashSrc)
  .extract({ left: 0, top: 340, width: meta.width, height: 510 })
  .resize({ width: WIDTH, withoutEnlargement: true })
  .webp({ quality: QUALITY })
  .toFile(`${OUT}/splash.webp`);

console.log(`cover.webp   ${cover.width}x${cover.height}  ${(cover.size / 1024).toFixed(0)} KB`);
console.log(`splash.webp  ${splash.width}x${splash.height}  ${(splash.size / 1024).toFixed(0)} KB`);
