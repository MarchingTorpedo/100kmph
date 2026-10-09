// Unit tests for check-budget.mjs. Builds tiny fixture dist folders in a temp dir.
// Run: node --test scripts/check-budget.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  BUDGETS,
  analyzeDist,
  extractPageScripts,
  findDynamicImports,
  findStaticImports,
} from './check-budget.mjs';

const root = mkdtempSync(join(tmpdir(), 'check-budget-'));
after(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
// Writes { 'path/in/dist': contents } into a fresh dist folder and returns it.
function fixture(files) {
  const dist = join(root, `dist-${n++}`);
  mkdirSync(dist, { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    const full = join(dist, ...path.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
  return dist;
}

const page = (head) => `<!doctype html><html><head>${head}</head><body></body></html>`;

test('static import regex: plain and minified forms, never import()', () => {
  const code = [
    `import a from './a.js';`,
    `import { b } from "./b.js"`,
    `import './c.js';`,
    `export * from './d.js';`,
    `import{e as f}from"./e.js";import"./f.js";export{g}from"./g.js";`,
    `const h = import('./lazy.js'); const i = import.meta.url;`,
    `x.import('./not.js')`,
  ].join('\n');
  assert.deepEqual(findStaticImports(code), [
    './a.js',
    './b.js',
    './c.js',
    './d.js',
    './e.js',
    './f.js',
    './g.js',
  ]);
  assert.deepEqual(findDynamicImports(code), ['./lazy.js']);
});

test('extractPageScripts: counts JS, skips data script types', () => {
  const { inline, srcs } = extractPageScripts(
    page(`
      <script>var a=1</script>
      <script type="module">var b=2</script>
      <script type="text/javascript">var c=3</script>
      <script type="application/ld+json">{"@type":"Product"}</script>
      <script type="application/json">{}</script>
      <script type="importmap">{"imports":{}}</script>
      <script type="speculationrules">{}</script>
      <script type="text/template"><p>x</p></script>
      <script type="module" src="/_astro/m.js"></script>
      <link rel="modulepreload" href="/_astro/p.js">
      <link rel="stylesheet" href="/_astro/s.css">
      <!-- <script src="/_astro/commented.js"></script> -->`),
  );
  assert.deepEqual(inline, ['var a=1', 'var b=2', 'var c=3']);
  assert.deepEqual(srcs, ['/_astro/m.js', '/_astro/p.js']);
});

test('inline scripts counted, json-ld excluded', () => {
  const js = 'console.log("hello budget")';
  const dist = fixture({
    'index.html': page(`<script>${js}</script><script type="application/ld+json">${'{"x":1}'.repeat(500)}</script>`),
  });
  const r = analyzeDist(dist);
  assert.equal(r.ok, true);
  assert.equal(r.pages.length, 1);
  assert.equal(r.pages[0].files, 1);
  assert.equal(r.pages[0].raw, Buffer.byteLength(js));
});

test('static import chain followed (minified), dynamic import not followed', () => {
  const dist = fixture({
    'index.html': page('<script type="module" src="/_astro/entry.js"></script>'),
    '_astro/entry.js': 'import{a as b}from"./a.js";import"./side.js";import("./gsap.js").then(m=>m)',
    '_astro/a.js': 'export * from "./deep/b.js"; export const a = 1;',
    '_astro/deep/b.js': 'import x from "../shared.js"; export const b = x;',
    '_astro/shared.js': 'export default 1',
    '_astro/side.js': 'window.s=1',
    '_astro/gsap.js': 'import"./gsap-core.js";export const g=' + '"x"'.repeat(1000),
    '_astro/gsap-core.js': 'export const core=1',
  });
  const r = analyzeDist(dist);
  assert.equal(r.ok, true, r.errors.join('\n'));
  const p = r.pages[0];
  assert.deepEqual(p.initialFiles.sort(), [
    '/_astro/a.js',
    '/_astro/deep/b.js',
    '/_astro/entry.js',
    '/_astro/shared.js',
    '/_astro/side.js',
  ]);
  assert.deepEqual(r.lazy.map((l) => l.url), ['/_astro/gsap-core.js', '/_astro/gsap.js']);
});

test('modulepreload counted; each file once per page', () => {
  const dist = fixture({
    'shop/index.html': page(
      '<link rel="modulepreload" href="/_astro/pre.js"><script type="module" src="../_astro/pre.js"></script>',
    ),
    '_astro/pre.js': 'export const p = 1',
  });
  const r = analyzeDist(dist);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.pages[0].page, '/shop/index.html');
  assert.deepEqual(r.pages[0].initialFiles, ['/_astro/pre.js']);
  assert.equal(r.pages[0].raw, Buffer.byteLength('export const p = 1'));
});

test('over-budget page fails with an injected budget', () => {
  const dist = fixture({
    'index.html': page('<script src="/_astro/big.js"></script>'),
    '_astro/big.js': Array.from({ length: 2000 }, (_, i) => `var v${i}=${i * 7919};`).join(''),
  });
  const pass = analyzeDist(dist);
  assert.equal(pass.ok, true);
  const fail = analyzeDist(dist, { ...BUDGETS, initialJsGzip: 100 });
  assert.equal(fail.ok, false);
  assert.equal(fail.pages[0].pass, false);
});

test('external script fails loudly', () => {
  const dist = fixture({
    'index.html': page('<script src="https://cdn.example.com/lib.js"></script>'),
  });
  const r = analyzeDist(dist);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /external script/);
});

test('missing local script fails', () => {
  const dist = fixture({ 'index.html': page('<script type="module" src="/_astro/gone.js"></script>') });
  const r = analyzeDist(dist);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /not found/);
});

test('empty dist fails', () => {
  const dist = fixture({ '_astro/a.js': 'var a' });
  const r = analyzeDist(dist);
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /no HTML files/);
});

test('poster over budget fails, within budget passes', () => {
  const dist = fixture({
    'index.html': page(''),
    '_astro/poster-hero.abc123.avif': Buffer.alloc(61 * 1024),
    '_astro/poster-hero.abc123.webp': Buffer.alloc(80 * 1024),
    '_astro/other.avif': Buffer.alloc(500 * 1024),
  });
  const r = analyzeDist(dist);
  assert.equal(r.ok, false);
  const byExt = Object.fromEntries(r.posters.map((p) => [p.file.split('.').pop(), p.pass]));
  assert.deepEqual(byExt, { avif: false, webp: true });
  assert.equal(r.posters.length, 2);
});

test('requirePoster fails when no AVIF poster exists', () => {
  const dist = fixture({ 'index.html': '<p>no scripts</p>', '_astro/hero-road.avif': 'x' });
  assert.equal(analyzeDist(dist).ok, true);
  const r = analyzeDist(dist, BUDGETS, { requirePoster: true });
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /no poster/);
});
