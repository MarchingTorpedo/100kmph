#!/usr/bin/env node
// Report which product photos are too small or too few, from the snapshot's products.json.
// Reads the width/height the store publishes for each image, so it needs no image libraries.
//
//   node scripts/audit-images.mjs            # default: flag long side under 1200 px
//   MIN_LONG_SIDE=1600 node scripts/audit-images.mjs
//
// Writes data-private/snapshot/image-audit.json and prints a summary.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = join("data-private", "snapshot");
const MIN_LONG_SIDE = Number(process.env.MIN_LONG_SIDE ?? 1200);
const MIN_IMAGES = Number(process.env.MIN_IMAGES ?? 3);

const products = JSON.parse(await readFile(join(DIR, "products.json"), "utf8"));
const rows = products.map((p) => {
  const images = p.images ?? [];
  const small = images.filter((i) => Math.max(i.width ?? 0, i.height ?? 0) < MIN_LONG_SIDE);
  return {
    handle: p.handle,
    title: p.title,
    imageCount: images.length,
    smallImages: small.length,
    largestLongSide: Math.max(0, ...images.map((i) => Math.max(i.width ?? 0, i.height ?? 0))),
    needsPhotos: images.length < MIN_IMAGES || small.length === images.length,
  };
});

await writeFile(join(DIR, "image-audit.json"), JSON.stringify(rows, null, 2));

const needs = rows.filter((r) => r.needsPhotos);
console.log(`${products.length} products, ${products.reduce((n, p) => n + (p.images?.length ?? 0), 0)} images`);
console.log(`Threshold: long side >= ${MIN_LONG_SIDE}px, at least ${MIN_IMAGES} images per product`);
console.log(`${needs.length} products need better or more photos:`);
for (const r of needs) {
  console.log(`  ${r.handle}: ${r.imageCount} image(s), largest ${r.largestLongSide}px`);
}
