// Rough lab measurement of the landing page on an emulated mid-range phone.
// Not part of CI. Usage (with a server running, e.g. the e2e one on 4330):
//   node e2e/measure.mjs [url] [runs]
// Pixel 7 emulation, 4x CPU throttling, "Fast 4G"-like network (150 ms RTT,
// 1.6 Mbps down, 750 Kbps up), cold cache. Prints each run and the median.
import { chromium, devices } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:4330/';
const runs = Number(process.argv[3] ?? 3);
const QUIET_MS = 3000; // after `load`, so LCP / CLS / long tasks have settled

// Installed before any page script: collects the paint metrics in the page.
function observe() {
  const m = (window.__metrics = { lcp: 0, lcpEl: '', cls: 0, fcp: 0, longTasks: 0, longTaskMs: 0 });
  const describe = (el) => {
    if (!el) return '(none)';
    const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    const src = el.currentSrc ? ` ${el.currentSrc.split('/').pop()}` : '';
    const text = !src && el.textContent ? ` "${el.textContent.trim().slice(0, 40)}"` : '';
    return `${el.tagName.toLowerCase()}${cls}${src}${text}`;
  };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      m.lcp = e.startTime;
      m.lcpEl = describe(e.element);
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) m.cls += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') m.fcp = e.startTime;
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      m.longTasks += 1;
      m.longTaskMs += e.duration;
    }
  }).observe({ type: 'longtask', buffered: true });
}

async function measureOnce(browser) {
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  await page.addInitScript(observe);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const types = new Map();
  let jsBytes = 0;
  let transferBytes = 0;
  let requests = 0;
  cdp.on('Network.responseReceived', (e) => types.set(e.requestId, { type: e.type, url: e.response.url }));
  cdp.on('Network.loadingFinished', (e) => {
    requests += 1;
    transferBytes += e.encodedDataLength;
    const t = types.get(e.requestId);
    if (t && (t.type === 'Script' || /\.m?js(\?|$)/.test(t.url))) jsBytes += e.encodedDataLength;
  });

  await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForTimeout(QUIET_MS);

  const result = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return { ...window.__metrics, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd };
  });
  await context.close();
  return { ...result, jsBytes, transferBytes, requests };
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const ms = (v) => `${Math.round(v)} ms`;
const kb = (v) => `${(v / 1024).toFixed(1)} KB`;

const browser = await chromium.launch();
const results = [];
try {
  for (let i = 1; i <= runs; i++) {
    const r = await measureOnce(browser);
    results.push(r);
    console.log(
      `run ${i}: LCP ${ms(r.lcp)} (${r.lcpEl}) | CLS ${r.cls.toFixed(4)} | FCP ${ms(r.fcp)} | ` +
        `DCL ${ms(r.dcl)} | load ${ms(r.load)} | JS ${kb(r.jsBytes)} | transfer ${kb(r.transferBytes)} ` +
        `(${r.requests} req) | long tasks ${r.longTasks} (${ms(r.longTaskMs)})`,
    );
  }
} finally {
  await browser.close();
}

const pick = (k) => median(results.map((r) => r[k]));
const lcpEls = [...new Set(results.map((r) => r.lcpEl))].join(' / ');
console.log(`\nMedian of ${runs} runs, ${url}`);
console.log('Pixel 7 emulation, 4x CPU, 150 ms RTT, 1.6 Mbps down / 750 Kbps up, cold cache');
console.log(`  LCP              ${ms(pick('lcp'))}  (element: ${lcpEls})`);
console.log(`  CLS              ${pick('cls').toFixed(4)}`);
console.log(`  FCP              ${ms(pick('fcp'))}`);
console.log(`  DOMContentLoaded ${ms(pick('dcl'))}`);
console.log(`  load             ${ms(pick('load'))}`);
console.log(`  JS transferred   ${kb(pick('jsBytes'))}`);
console.log(`  total transfer   ${kb(pick('transferBytes'))}`);
console.log(`  long tasks       ${pick('longTasks')} (${ms(pick('longTaskMs'))} total)`);
