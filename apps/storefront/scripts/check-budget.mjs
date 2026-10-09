// Checks a built site against the performance budgets in docs/motion-spec.md.
// For every HTML page it sums the gzip size of the page's initial JS (inline
// scripts, local <script src>, modulepreload, and their static imports).
// Dynamic import() targets are lazy and not counted; they are listed so it is
// clear GSAP is left out on purpose. Exits 1 when anything is over budget.
// Run: node scripts/check-budget.mjs [distDir]   (default: dist)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

// One place for budgets. Sources: CLAUDE.md "Budgets" and docs/motion-spec.md
// (scene 1 assets, asset table, risk 2 "JS budget creep").
export const BUDGETS = {
  // Initial JS per page, gzip. Spec sets it for product/listing pages; we apply it everywhere.
  initialJsGzip: 170 * 1024,
  // Hero poster: AVIF 1280w <= 60 KB, WebP fallback <= 90 KB (raw bytes).
  posterAvif: 60 * 1024,
  posterWebp: 90 * 1024,
};

// Inline script types that are JavaScript. Anything else (json, ld+json,
// importmap, speculationrules, templates) is data and not counted.
const JS_TYPES = new Set([
  '',
  'module',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
]);

const gzipBytes = (buf) => gzipSync(buf, { level: 9 }).length;

// Static `import ... from 'x'`, `import 'x'`, `export ... from 'x'`, minified
// or not. After the keyword we need a quote, or a clause ending in `from`;
// `(` is never allowed there, so `import(...)` and `import.meta` never match.
const STATIC_IMPORT_RE =
  /(?:^|[^\w$.])(?:import|export)\s*(?:[\w$*{][^;'"`()]*?\bfrom\s*)?(['"])([^'"\n]+)\1/g;
// Dynamic `import('x')` with a literal string specifier.
const DYNAMIC_IMPORT_RE = /(?:^|[^\w$.])import\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)/g;

export function findStaticImports(code) {
  return [...code.matchAll(STATIC_IMPORT_RE)].map((m) => m[2]);
}

export function findDynamicImports(code) {
  return [...code.matchAll(DYNAMIC_IMPORT_RE)].map((m) => m[2]);
}

// Reads an attribute value; '' for a bare boolean attribute, null if absent.
function attr(attrs, name) {
  const re = new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?(?=[\\s/]|$)`, 'i');
  const m = attrs.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

// Pulls scripts and modulepreloads out of one HTML document.
export function extractPageScripts(html) {
  const doc = html.replace(/<!--[\s\S]*?-->/g, '');
  const inline = [];
  const srcs = [];
  for (const m of doc.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[1];
    const src = attr(attrs, 'src');
    const type = (attr(attrs, 'type') ?? '').trim().toLowerCase();
    if (src) {
      if (JS_TYPES.has(type)) srcs.push(src);
    } else if (JS_TYPES.has(type) && m[2].trim()) {
      inline.push(m[2]);
    }
  }
  for (const m of doc.matchAll(/<link\b([^>]*)>/gi)) {
    const rel = (attr(m[1], 'rel') ?? '').toLowerCase().split(/\s+/);
    const href = attr(m[1], 'href');
    if (rel.includes('modulepreload') && href) srcs.push(href);
  }
  return { inline, srcs };
}

const isExternal = (ref) => /^([a-z][a-z0-9+.-]*:)?\/\//i.test(ref);
const isLocal = (ref) => ref.startsWith('/') || ref.startsWith('./') || ref.startsWith('../');

// Resolves `ref` against a site URL path (e.g. /_astro/a.js) to a URL path.
function resolveUrlPath(ref, fromUrlPath) {
  return new URL(ref, `http://site${fromUrlPath}`).pathname;
}

function urlPathToFile(distDir, urlPath) {
  return join(distDir, ...decodeURIComponent(urlPath).split('/').filter(Boolean));
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// Analyses one page. Returns its initial files, lazy files and any errors.
export function analyzePage(distDir, htmlFile, budget = BUDGETS.initialJsGzip, cache = new Map()) {
  const errors = [];
  const pageUrl = '/' + relative(distDir, htmlFile).split(sep).join('/');
  const { inline, srcs } = extractPageScripts(readFileSync(htmlFile, 'utf8'));

  const readJs = (urlPath) => {
    if (!cache.has(urlPath)) {
      const file = urlPathToFile(distDir, urlPath);
      cache.set(urlPath, existsSync(file) ? readFileSync(file) : null);
    }
    return cache.get(urlPath);
  };

  // Follows static imports from `code` (located at `fromUrl`), adding to `seen`.
  const initial = new Set();
  const dynamicRefs = [];
  const follow = (code, fromUrl, seen, onDynamic) => {
    for (const spec of findStaticImports(code)) {
      if (isExternal(spec) || !isLocal(spec)) {
        errors.push(`${pageUrl}: import "${spec}" in ${fromUrl} is not a local path (we self-host everything)`);
        continue;
      }
      visit(resolveUrlPath(spec, fromUrl), fromUrl, seen, onDynamic);
    }
    for (const spec of findDynamicImports(code)) {
      if (isLocal(spec)) onDynamic(resolveUrlPath(spec, fromUrl));
    }
  };
  const visit = (urlPath, fromUrl, seen, onDynamic) => {
    if (seen.has(urlPath)) return;
    const buf = readJs(urlPath);
    if (!buf) {
      errors.push(`${pageUrl}: ${urlPath} (from ${fromUrl}) not found in ${distDir}`);
      return;
    }
    seen.add(urlPath);
    follow(buf.toString('utf8'), urlPath, seen, onDynamic);
  };

  for (const code of inline) follow(code, pageUrl, initial, (u) => dynamicRefs.push(u));
  for (const src of srcs) {
    // In HTML, any non-absolute URL is local (a bare "a.js" is relative).
    if (isExternal(src) || /^[a-z][a-z0-9+.-]*:/i.test(src)) {
      errors.push(`${pageUrl}: external script "${src}" (we self-host everything)`);
      continue;
    }
    visit(resolveUrlPath(src, pageUrl), pageUrl, initial, (u) => dynamicRefs.push(u));
  }

  // Lazy: everything reachable from dynamic imports that is not already initial.
  const lazy = new Set();
  const queue = [...dynamicRefs];
  while (queue.length) {
    const u = queue.shift();
    if (initial.has(u) || lazy.has(u)) continue;
    const reach = new Set();
    visit(u, pageUrl, reach, (d) => queue.push(d));
    for (const r of reach) if (!initial.has(r)) lazy.add(r);
  }

  let raw = 0;
  let gzip = 0;
  for (const code of inline) {
    const buf = Buffer.from(code, 'utf8');
    raw += buf.length;
    gzip += gzipBytes(buf);
  }
  for (const u of initial) {
    raw += cache.get(u).length;
    gzip += gzipBytes(cache.get(u));
  }
  const lazyFiles = [...lazy].map((u) => ({ url: u, gzip: gzipBytes(cache.get(u)) }));

  return {
    page: pageUrl,
    files: inline.length + initial.size,
    inlineCount: inline.length,
    initialFiles: [...initial],
    raw,
    gzip,
    budget,
    pass: gzip <= budget && errors.length === 0,
    lazy: lazyFiles,
    errors,
  };
}

// Checks poster images under _astro/ against the asset budgets.
export function checkPosters(distDir, budgets = BUDGETS) {
  const astroDir = join(distDir, '_astro');
  if (!existsSync(astroDir)) return [];
  return walk(astroDir)
    .map((file) => {
      const name = file.slice(file.lastIndexOf(sep) + 1).toLowerCase();
      if (!name.startsWith('poster')) return null;
      const budget = name.endsWith('.avif') ? budgets.posterAvif : name.endsWith('.webp') ? budgets.posterWebp : null;
      if (budget == null) return null;
      const bytes = statSync(file).size;
      return { file: relative(distDir, file).split(sep).join('/'), bytes, budget, pass: bytes <= budget };
    })
    .filter(Boolean);
}

// Analyses a whole dist folder. `budgets` can be overridden (tests do).
// `requirePoster` fails the check when no AVIF poster is found, so renaming
// the hero image can't make the poster budget pass silently (the CLI sets it).
export function analyzeDist(distDir, budgets = BUDGETS, { requirePoster = false } = {}) {
  const errors = [];
  if (!existsSync(distDir)) {
    return { pages: [], lazy: [], posters: [], errors: [`${distDir} does not exist`], ok: false };
  }
  const htmlFiles = walk(distDir).filter((f) => f.toLowerCase().endsWith('.html')).sort();
  if (htmlFiles.length === 0) errors.push(`no HTML files in ${distDir} (empty build?)`);

  const cache = new Map();
  const pages = htmlFiles.map((f) => analyzePage(distDir, f, budgets.initialJsGzip, cache));
  for (const p of pages) errors.push(...p.errors);

  // Lazy chunks across the site, with how many pages reference each.
  const lazyMap = new Map();
  for (const p of pages) {
    for (const l of p.lazy) {
      const entry = lazyMap.get(l.url) ?? { ...l, pages: 0 };
      entry.pages += 1;
      lazyMap.set(l.url, entry);
    }
  }
  const lazy = [...lazyMap.values()].sort((a, b) => a.url.localeCompare(b.url));
  const posters = checkPosters(distDir, budgets);
  if (requirePoster && !posters.some((p) => p.file.endsWith('.avif'))) {
    errors.push('no poster*.avif found in _astro/: was the hero poster renamed? Update checkPosters.');
  }

  const ok = errors.length === 0 && pages.every((p) => p.pass) && posters.every((p) => p.pass);
  return { pages, lazy, posters, errors, ok };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function table(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (r) => r.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

export function formatReport(result) {
  const out = [];
  out.push('Initial JS per page (gzip -9)');
  out.push(
    table(
      ['page', 'files', 'raw', 'gzip', 'budget', '%', 'result'],
      result.pages.map((p) => [
        p.page,
        p.files,
        kb(p.raw),
        kb(p.gzip),
        kb(p.budget),
        `${((p.gzip / p.budget) * 100).toFixed(1)}%`,
        p.pass ? 'PASS' : 'FAIL',
      ]),
    ),
  );
  out.push('');
  out.push('Lazy chunks (dynamic import)');
  out.push(
    result.lazy.length
      ? table(['chunk', 'gzip', 'pages', 'note'], result.lazy.map((l) => [l.url, kb(l.gzip), l.pages, 'lazy, not counted']))
      : '(none)',
  );
  out.push('');
  out.push('Posters (raw bytes)');
  out.push(
    result.posters.length
      ? table(
          ['file', 'size', 'budget', 'result'],
          result.posters.map((p) => [p.file, kb(p.bytes), kb(p.budget), p.pass ? 'PASS' : 'FAIL']),
        )
      : '(none found)',
  );
  if (result.errors.length) {
    out.push('');
    out.push('Errors');
    for (const e of result.errors) out.push(`  ${e}`);
  }
  out.push('');
  out.push(result.ok ? 'Budget check passed.' : 'Budget check FAILED.');
  return out.join('\n');
}

function main() {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const distDir = resolve(root, process.argv[2] ?? 'dist');
  const result = analyzeDist(distDir, BUDGETS, { requirePoster: true });
  console.log(formatReport(result));
  process.exit(result.ok ? 0 : 1);
}

// Run only when executed directly, not when imported by the test.
const self = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? resolve(process.argv[1]) : '';
const same = process.platform === 'win32' ? self.toLowerCase() === entry.toLowerCase() : self === entry;
if (same || import.meta.url === (entry && pathToFileURL(entry).href)) main();
