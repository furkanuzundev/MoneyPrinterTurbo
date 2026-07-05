// Regenerates every Reelate icon/favicon/social asset from the SVG masters in
// public/brand/. Run after changing the mark:  node scripts/generate-icons.mjs
//
// Requires `sharp` (already a dependency via Next tooling). Outputs go to the
// App Router metadata locations (src/app/*) and public/ for the PWA manifest.
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const brand = join(root, "public", "brand");
const app = join(root, "src", "app");
const pub = join(root, "public");

const mark = join(brand, "reelate-mark.svg");
const maskable = join(brand, "reelate-mark-maskable.svg");
const og = join(brand, "reelate-og.svg");

const png = (src, size) =>
  sharp(src, { density: 384 }).resize(size, size, { fit: "contain" }).png();

async function main() {
  mkdirSync(join(pub, "icons"), { recursive: true });

  // App Router file-convention icons (auto-wired by Next into <head>).
  await png(mark, 180).toFile(join(app, "apple-icon.png")); // apple-touch-icon
  writeFileSync(join(app, "icon.svg"), readFileSync(mark)); // scalable favicon

  // Multi-resolution favicon.ico (16/32/48 packed).
  const icoSizes = [16, 32, 48];
  const icoBufs = await Promise.all(icoSizes.map((s) => png(mark, s).toBuffer()));
  writeFileSync(join(app, "favicon.ico"), buildIco(icoBufs, icoSizes));

  // PWA / manifest icons.
  await png(mark, 192).toFile(join(pub, "icons", "icon-192.png"));
  await png(mark, 512).toFile(join(pub, "icons", "icon-512.png"));
  await png(maskable, 192).toFile(join(pub, "icons", "icon-maskable-192.png"));
  await png(maskable, 512).toFile(join(pub, "icons", "icon-maskable-512.png"));

  // Social cards (OpenGraph + Twitter share the same 1200x630 art).
  const ogPng = await sharp(og, { density: 192 })
    .resize(1200, 630)
    .png()
    .toBuffer();
  writeFileSync(join(app, "opengraph-image.png"), ogPng);
  writeFileSync(join(app, "twitter-image.png"), ogPng);

  console.log("Icons regenerated from public/brand/ masters.");
}

// Minimal ICO container: header + one directory entry per PNG-encoded image.
// PNG-in-ICO is supported by all evergreen browsers.
function buildIco(buffers, sizes) {
  const count = buffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  const entries = [];
  buffers.forEach((buf, i) => {
    const s = sizes[i];
    const e = dir.subarray(i * 16, i * 16 + 16);
    e.writeUInt8(s >= 256 ? 0 : s, 0); // width
    e.writeUInt8(s >= 256 ? 0 : s, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32LE(buf.length, 8); // size
    e.writeUInt32LE(offset, 12); // offset
    offset += buf.length;
    entries.push(buf);
  });
  return Buffer.concat([header, dir, ...entries]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
