#!/usr/bin/env node
// Snapshot the public catalogue of a Shopify storefront into data-private/snapshot/.
// Uses only public endpoints that the site's robots.txt allows. Node 22+, no dependencies.
//
//   node scripts/snapshot-site.mjs                  # snapshot https://100kmph.com
//   BASE=https://example.com node scripts/snapshot-site.mjs
//
// Output (git-ignored, never commit it):
//   data-private/snapshot/products.json      all products, variants, images
//   data-private/snapshot/collections.json   collections plus which products each holds
//   data-private/snapshot/urls.json          every URL from the sitemaps (for the redirect map)
//   data-private/snapshot/pages/*.html       raw HTML of pages and the home page
//   data-private/snapshot/images/...         product and brand images
//   data-private/snapshot/manifest.json      source URL, size and sha256 of every saved file

import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, extname } from "node:path";

const BASE = (process.env.BASE ?? "https://100kmph.com").replace(/\/$/, "");
const OUT = join("data-private", "snapshot");
const UA = "100kmph-migration-snapshot/1.0 (site owner's developer; contact via the shop)";
const DELAY_MS = 400; // be gentle: roughly 2 requests per second
const manifest = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { binary = false, tries = 4 } = {}) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    await sleep(DELAY_MS);
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch (err) {
      if (attempt === tries) throw new Error(`${url}: ${err.message}`);
      await sleep(1000 * 2 ** attempt);
    }
  }
}

async function save(relPath, data, sourceUrl) {
  const full = join(OUT, relPath);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, data);
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  manifest.push({
    file: relPath,
    source: sourceUrl,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    fetchedAt: new Date().toISOString(),
  });
}

async function paged(path, key) {
  const all = [];
  for (let page = 1; ; page++) {
    const text = await get(`${BASE}${path}?limit=250&page=${page}`);
    const items = JSON.parse(text)[key] ?? [];
    all.push(...items);
    if (items.length < 250) return all;
  }
}

function imageExt(url) {
  const ext = extname(new URL(url).pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".avif"].includes(ext) ? ext : ".jpg";
}

async function downloadImage(url, relPath) {
  try {
    await save(relPath, await get(url, { binary: true }), url);
  } catch (err) {
    console.warn(`  skipped image: ${err.message}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  console.log("Products...");
  const products = await paged("/products.json", "products");
  await save("products.json", JSON.stringify(products, null, 2), `${BASE}/products.json`);
  console.log(`  ${products.length} products`);

  console.log("Collections...");
  const collections = await paged("/collections.json", "collections");
  for (const c of collections) {
    try {
      const items = await paged(`/collections/${c.handle}/products.json`, "products");
      c.product_handles = items.map((p) => p.handle);
    } catch (err) {
      console.warn(`  collection ${c.handle}: ${err.message}`);
      c.product_handles = [];
    }
  }
  await save("collections.json", JSON.stringify(collections, null, 2), `${BASE}/collections.json`);
  console.log(`  ${collections.length} collections`);

  console.log("Sitemaps (URL list for redirects)...");
  const urls = [];
  const index = await get(`${BASE}/sitemap.xml`);
  for (const [, child] of index.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const xml = await get(child.replaceAll("&amp;", "&"));
    for (const [, loc] of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(loc);
  }
  const uniqueUrls = [...new Set(urls)];
  await save("urls.json", JSON.stringify(uniqueUrls, null, 2), `${BASE}/sitemap.xml`);
  console.log(`  ${uniqueUrls.length} URLs`);

  console.log("Pages (raw HTML)...");
  const pageUrls = uniqueUrls.filter((u) => /\/(pages|blogs)\//.test(u));
  for (const u of [BASE + "/", ...pageUrls]) {
    try {
      const name = new URL(u).pathname.replace(/^\/|\/$/g, "").replaceAll("/", "__") || "home";
      await save(`pages/${name}.html`, await get(u), u);
    } catch (err) {
      console.warn(`  page skipped: ${err.message}`);
    }
  }

  console.log("Product images...");
  for (const p of products) {
    for (const [i, img] of (p.images ?? []).entries()) {
      await downloadImage(img.src, `images/products/${p.handle}/${String(i + 1).padStart(2, "0")}${imageExt(img.src)}`);
    }
  }

  console.log("Brand images from the home page (logo, banners)...");
  const home = await get(BASE + "/");
  const found = new Set();
  for (const [, src] of home.matchAll(/(?:src|content|href)=["']((?:https?:)?\/\/[^"']+?\.(?:png|jpe?g|webp|svg|gif))(?:\?[^"']*)?["']/gi)) {
    found.add(src.startsWith("//") ? "https:" + src : src);
  }
  for (const src of found) {
    if (!/\/cdn\/shop\//.test(src) || /\/products\//.test(src)) continue;
    const name = new URL(src).pathname.split("/").pop();
    await downloadImage(src, `images/brand/${name}`);
  }

  await save("manifest.json", JSON.stringify(manifest, null, 2), BASE);
  console.log(`Done. ${manifest.length} files in ${OUT}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
