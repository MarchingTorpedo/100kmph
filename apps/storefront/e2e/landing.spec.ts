import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

/*
 * Landing page (scenes 1 and 2) at phone width. Motion modes:
 *   full    - OS allows motion, no saved toggle, not lite
 *   reduced - prefers-reduced-motion: reduce (or the footer toggle)
 *   lite    - Save-Data, emulated by defining navigator.connection before any page script
 *
 * Scroll maths for the crossing (styles/crossing.css): the section is 1.6vh
 * tall with a sticky 1vh stage, and the scrub runs over `cover 55vh` to
 * `cover 205vh`. With T = the section's document top and H = innerHeight:
 *   scrub progress p is at scrollY = T - 0.45H + p * 1.5H
 *   the stage is pinned for scrollY in [T, T + 0.6H]
 * The GSAP fallback uses the same window (`top 45%`, +1.5H).
 */

type Mode = 'full' | 'reduced' | 'lite';
const MODES: Mode[] = ['full', 'reduced', 'lite'];

async function useMode(page: Page, mode: Mode) {
  await page.emulateMedia({ reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference' });
  if (mode === 'lite') {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        configurable: true,
        get: () => ({ saveData: true, effectiveType: '4g' }),
      });
    });
  }
}

/** Console errors, uncaught page errors and failed (>= 400) responses. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
  });
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  return errors;
}

/** Instant scroll (the root has scroll-behavior: smooth in full mode), then two frames. */
async function scrollToY(page: Page, y: number): Promise<number> {
  return page.evaluate(async (top) => {
    window.scrollTo({ top, behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return window.scrollY;
  }, y);
}

async function crossingGeometry(page: Page) {
  return page.evaluate(() => {
    const r = document.getElementById('crossing')!.getBoundingClientRect();
    return {
      top: r.top + window.scrollY,
      height: r.height,
      vh: window.innerHeight,
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
}

/** scrollY for scrub progress p (may be < 0 or > 1 to go before/after the window). */
function scrubY(g: { top: number; vh: number }, p: number) {
  return Math.round(g.top - 0.45 * g.vh + p * 1.5 * g.vh);
}

function parseStretch(v: string): number {
  const keywords: Record<string, number> = {
    'ultra-condensed': 50, 'extra-condensed': 62.5, condensed: 75, 'semi-condensed': 87.5, normal: 100,
    'semi-expanded': 112.5, expanded: 125, 'extra-expanded': 150, 'ultra-expanded': 200,
  };
  return keywords[v] ?? parseFloat(v);
}

async function probe(page: Page) {
  const raw = await page.evaluate(() => {
    const stage = document.querySelector<HTMLElement>('.crossing__stage')!;
    const vehicle = document.querySelector<HTMLElement>('.crossing__vehicle')!;
    const numeral = document.querySelector<HTMLElement>('.crossing__numeral')!;
    const s = stage.getBoundingClientRect();
    const v = vehicle.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      stageTop: s.top,
      stageLeft: s.left,
      stageWidth: s.width,
      stagePosition: getComputedStyle(stage).position,
      riderX: v.x - s.left,
      riderWidth: v.width,
      /** Rider centre minus stage centre, px. */
      riderOffset: v.x + v.width / 2 - (s.left + s.width / 2),
      stretch: getComputedStyle(numeral).fontStretch,
      vehicleAnimations: vehicle.getAnimations().length,
    };
  });
  return { ...raw, stretch: parseStretch(raw.stretch) };
}

/** Probe until two consecutive frames agree (GSAP scrubs on its own ticker). */
async function settledProbe(page: Page) {
  let prev = await probe(page);
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const next = await probe(page);
    if (Math.abs(next.riderX - prev.riderX) < 0.5 && next.stretch === prev.stretch) return next;
    prev = next;
  }
  return prev;
}

async function overflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

/** Resolves after landing.ts's post-`load` idle callback has had its turn. */
async function afterIdle(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(
    () =>
      new Promise<void>((r) => {
        const done = () => setTimeout(r, 300);
        if ('requestIdleCallback' in window) requestIdleCallback(done, { timeout: 2500 });
        else setTimeout(done, 400);
      }),
  );
}

const gsapChunk = (url: string) => url.includes('crossing-gsap');

// ---------------------------------------------------------------- a + b

for (const mode of MODES) {
  test.describe(`${mode} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await useMode(page, mode);
    });

    test('no horizontal overflow at the top, through the crossing and at the end', async ({ page }) => {
      await page.goto('/');
      const at: Record<string, Awaited<ReturnType<typeof overflow>>> = {};
      at.top = await overflow(page);
      const g = await crossingGeometry(page);
      for (const p of [-0.2, 0, 0.25, 0.5, 0.75, 1, 1.2]) {
        await scrollToY(page, scrubY(g, p));
        at[`p=${p}`] = await overflow(page);
      }
      await scrollToY(page, g.maxScroll);
      at.end = await overflow(page);
      for (const [where, o] of Object.entries(at)) {
        expect.soft(o.scrollWidth, `documentElement overflow at ${where}`).toBeLessThanOrEqual(o.innerWidth);
        expect.soft(o.bodyScrollWidth, `body overflow at ${where}`).toBeLessThanOrEqual(o.innerWidth);
      }
    });

    test('no console errors, page errors or failed requests', async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto('/');
      await afterIdle(page);
      const g = await crossingGeometry(page);
      for (const p of [0, 0.5, 1]) await scrollToY(page, scrubY(g, p));
      await scrollToY(page, g.maxScroll);
      expect(errors).toEqual([]);
    });

    test('motion attributes on <html> match the mode', async ({ page }) => {
      await page.goto('/');
      const html = page.locator('html');
      if (mode === 'reduced') await expect(html).toHaveAttribute('data-motion', 'reduced');
      else await expect(html).not.toHaveAttribute('data-motion', /.*/);
      if (mode === 'lite') await expect(html).toHaveAttribute('data-lite', '');
      else await expect(html).not.toHaveAttribute('data-lite', /.*/);
    });
  });
}

test('no console errors with the forced GSAP fallback (?scrub=gsap)', async ({ page }) => {
  await useMode(page, 'full');
  const errors = collectErrors(page);
  const chunk = page.waitForRequest((r) => gsapChunk(r.url()));
  await page.goto('/?scrub=gsap');
  await chunk;
  await afterIdle(page);
  const g = await crossingGeometry(page);
  for (const p of [0, 0.5, 1]) await scrollToY(page, scrubY(g, p));
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- c + d: Ignition

test.describe('Ignition', () => {
  test('full motion: needle sweeps to 180deg, counter reaches 100, headline settles', async ({ page }) => {
    await useMode(page, 'full');
    await page.goto('/');
    const needle = page.locator('.gauge__needle');

    // The sweep is a 1200 ms CSS animation (it stays listed afterwards because of fill: both).
    const anim = await needle.evaluate((el) =>
      el.getAnimations().map((a) => ({
        name: (a as CSSAnimation).animationName,
        duration: a.effect?.getTiming().duration,
      })),
    );
    expect(anim).toEqual([{ name: 'ignition-needle', duration: 1200 }]);

    const started = Date.now();
    await expect.poll(() => needle.evaluate((el) => getComputedStyle(el).rotate), { timeout: 4000 }).toBe('180deg');
    await expect
      .poll(() => page.locator('.gauge__count').evaluate((el) => getComputedStyle(el).getPropertyValue('--kmph').trim()), {
        timeout: 4000,
      })
      .toBe('100');
    // What the readout renders: counter-reset resolves var(--kmph, 100), so
    // this reads "kmph 0" or "none" if the counter would show 0.
    const reset = await page.locator('.gauge__count').evaluate((el) => getComputedStyle(el, '::after').counterReset);
    expect(reset).toBe('kmph 100');

    const copy = page.locator('.ignition__copy');
    await expect.poll(() => copy.evaluate((el) => getComputedStyle(el).opacity), { timeout: 4000 }).toBe('1');
    await expect(page.locator('#ignition-title')).toBeVisible();
    // Gauge dissolves into the headline (opacity 0 at 1400 ms).
    await expect.poll(() => page.locator('.gauge').evaluate((el) => getComputedStyle(el).opacity), { timeout: 4000 }).toBe('0');
    test.info().annotations.push({ type: 'ignition', description: `settled ${Date.now() - started} ms after goto resolved` });
  });

  test('reduced motion: needle already at 180deg with no animation, html is data-motion=reduced', async ({ page }) => {
    await useMode(page, 'reduced');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
    const needle = page.locator('.gauge__needle');
    const state = await needle.evaluate((el) => ({ rotate: getComputedStyle(el).rotate, animations: el.getAnimations().length }));
    expect(state).toEqual({ rotate: '180deg', animations: 0 });
    expect(await page.locator('.gauge__count').evaluate((el) => getComputedStyle(el).getPropertyValue('--kmph').trim())).toBe('100');
    await expect(page.locator('#ignition-title')).toBeVisible();
    // Motion reduced by the device: the toggle is aria-disabled (still
    // focusable, so focus is never lost) and the note explains why.
    const toggle = page.locator('[data-motion-toggle]');
    await expect(toggle).toHaveAttribute('aria-disabled', 'true');
    // Not natively disabled (Playwright's toBeEnabled also counts aria-disabled).
    expect(await toggle.evaluate((el) => (el as HTMLButtonElement).disabled)).toBe(false);
    await expect(page.locator('[data-motion-note]')).toBeVisible();
    await toggle.focus();
    await toggle.press('Enter');
    await expect(toggle).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  });
});

// ---------------------------------------------------------------- e + f + g: Crossing

test.describe('Crossing', () => {
  test('full motion (CSS scroll timeline): rider crosses, numeral peaks mid-scrub, stage pins', async ({ page }) => {
    await useMode(page, 'full');
    await page.goto('/');
    expect(await page.evaluate(() => CSS.supports('animation-timeline: view()'))).toBe(true);
    const g = await crossingGeometry(page);
    expect(g.height / g.vh).toBeCloseTo(1.6, 1);

    const ps = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
    const samples = [];
    for (const p of ps) {
      await scrollToY(page, scrubY(g, p));
      samples.push({ p, ...(await probe(page)) });
    }
    test.info().annotations.push({
      type: 'samples',
      description: samples.map((s) => `p=${s.p} x=${s.riderX.toFixed(1)} stretch=${s.stretch}`).join(' | '),
    });

    // Rider: strictly left to right, off the left edge at the start, off the right at the end, centred mid-way.
    for (let i = 1; i < samples.length; i++) expect(samples[i]!.riderX).toBeGreaterThan(samples[i - 1]!.riderX);
    const first = samples[0]!;
    const mid = samples[4]!;
    const last = samples[samples.length - 1]!;
    expect(first.riderX + first.riderWidth).toBeLessThanOrEqual(1);
    expect(last.riderX).toBeGreaterThanOrEqual(last.stageWidth - 1);
    expect(Math.abs(mid.riderOffset)).toBeLessThan(mid.stageWidth * 0.03);

    // Numeral: 100 at the ends, peak ~125 in the middle, ~112.5 at the quarters.
    const stretches = samples.map((s) => s.stretch);
    expect(stretches.indexOf(Math.max(...stretches))).toBe(4);
    expect(mid.stretch).toBeGreaterThanOrEqual(124);
    expect(Math.abs(samples[2]!.stretch - 112.5)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(samples[6]!.stretch - 112.5)).toBeLessThanOrEqual(1.5);
    expect(first.stretch).toBeCloseTo(100, 0);
    expect(last.stretch).toBeCloseTo(100, 0);

    // Pin: sticky, top == 0 for the 0.6H stretch from T, not before or after it.
    const pinned = [];
    for (const f of [0.05, 0.2, 0.4, 0.55]) {
      await scrollToY(page, Math.round(g.top + f * g.vh));
      pinned.push(await probe(page));
    }
    for (const s of pinned) {
      expect(s.stagePosition).toBe('sticky');
      expect(Math.abs(s.stageTop)).toBeLessThanOrEqual(1);
    }
    await scrollToY(page, Math.round(g.top - 0.2 * g.vh));
    expect((await probe(page)).stageTop).toBeGreaterThan(g.vh * 0.15);
    await scrollToY(page, Math.round(g.top + 0.8 * g.vh));
    expect((await probe(page)).stageTop).toBeLessThan(-g.vh * 0.15);

    // Past the section (UpNext gives the scrub room to finish): numeral back at rest.
    expect(g.maxScroll).toBeGreaterThanOrEqual(scrubY(g, 1));
    await scrollToY(page, g.maxScroll);
    const end = await probe(page);
    expect(end.stretch).toBe(100);
    expect(end.riderX).toBeGreaterThanOrEqual(end.stageWidth - 1);
  });

  test('reduced motion: not pinned, rider parked mid-frame, numeral at rest', async ({ page }) => {
    await useMode(page, 'reduced');
    await page.goto('/');
    const g = await crossingGeometry(page);
    expect(g.height).toBeLessThan(g.vh * 1.2);
    for (const y of [g.top - 0.3 * g.vh, g.top, g.top + 0.2 * g.vh]) {
      await scrollToY(page, Math.round(y));
      const s = await probe(page);
      expect(s.stagePosition).not.toBe('sticky');
      expect(Math.abs(s.riderOffset)).toBeLessThanOrEqual(2);
      expect(s.stretch).toBe(100);
      expect(s.vehicleAnimations).toBe(0);
    }
  });

  test('lite mode: no pinning, single translate on enter ends centred', async ({ page }) => {
    await useMode(page, 'lite');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-lite', '');
    const section = page.locator('#crossing');
    await expect(section).toHaveClass(/crossing--armed/);
    await expect(section).not.toHaveClass(/crossing--in/);

    const g = await crossingGeometry(page);
    expect(g.height).toBeLessThan(g.vh * 1.2);
    const before = await probe(page);
    expect(before.stagePosition).not.toBe('sticky');
    expect(before.riderX + before.riderWidth).toBeLessThanOrEqual(1); // parked off the left edge

    await scrollToY(page, Math.round(g.top));
    await expect(section).toHaveClass(/crossing--in/);
    await expect.poll(async () => Math.abs((await probe(page)).riderOffset), { timeout: 3000 }).toBeLessThanOrEqual(2);
    const after = await probe(page);
    expect(after.stagePosition).not.toBe('sticky');
    expect(after.stretch).toBe(100);
  });
});

// ---------------------------------------------------------------- h: footer toggle

test('footer toggle: reduce, persist across reload (inline head script alone), restore', async ({ page }) => {
  await useMode(page, 'full');
  await page.goto('/');
  const html = page.locator('html');
  const toggle = page.locator('[data-motion-toggle]');
  await expect(toggle).toBeEnabled();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(html).not.toHaveAttribute('data-motion', /.*/);

  await toggle.click();
  await expect(html).toHaveAttribute('data-motion', 'reduced');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => localStorage.getItem('100kmph:motion'))).toBe('reduced');
  // Styles follow the attribute: the crossing is no longer pinned.
  expect((await probe(page)).stagePosition).not.toBe('sticky');

  // Reload with every external script blocked: only the inline head script can set the attribute.
  await page.route(/\.js(\?|$)/, (r) => r.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(html).toHaveAttribute('data-motion', 'reduced');
  expect(await page.locator('.gauge__needle').evaluate((el) => el.getAnimations().length)).toBe(0);
  await page.unroute(/\.js(\?|$)/);

  // Normal reload: the script reflects the saved state in the button.
  await page.reload();
  await expect(html).toHaveAttribute('data-motion', 'reduced');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();
  await expect(html).not.toHaveAttribute('data-motion', /.*/);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('100kmph:motion'))).toBeNull();
  expect((await probe(page)).stagePosition).toBe('sticky');
});

// Regressions from the code and accessibility reviews.
test.describe('footer toggle regressions', () => {
  test('the button stays put when the page changes height', async ({ page }) => {
    await useMode(page, 'full');
    await page.goto('/');
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const toggle = page.locator('[data-motion-toggle]');
    const top = () => toggle.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    const start = await top();
    await toggle.click(); // reduce: the crossing loses 60vh
    expect(Math.abs((await top()) - start)).toBeLessThanOrEqual(2);
    await toggle.click(); // full again: the crossing regains 60vh above the button
    expect(Math.abs((await top()) - start)).toBeLessThanOrEqual(2);
    await expect(toggle).toBeInViewport();
  });

  test('works both ways when localStorage is blocked', async ({ page }) => {
    await useMode(page, 'full');
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await page.goto('/');
    const html = page.locator('html');
    const toggle = page.locator('[data-motion-toggle]');
    await toggle.click();
    await expect(html).toHaveAttribute('data-motion', 'reduced');
    await expect(toggle).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('[data-motion-note]')).toBeHidden();
    await toggle.click();
    await expect(html).not.toHaveAttribute('data-motion', /.*/);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });

  test('turning motion back on does not replay Ignition', async ({ page }) => {
    await useMode(page, 'full');
    await page.goto('/');
    const copy = page.locator('.ignition__copy');
    await expect.poll(() => copy.evaluate((el) => getComputedStyle(el).opacity), { timeout: 4000 }).toBe('1');
    const toggle = page.locator('[data-motion-toggle]');
    await toggle.click();
    await toggle.click();
    // Straight after re-enabling: headline still shown, gauge still dissolved, needle at 100.
    expect(await copy.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    expect(await page.locator('.gauge').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    expect(await page.locator('.gauge__needle').evaluate((el) => getComputedStyle(el).rotate)).toBe('180deg');
  });
});

test.describe('short viewports (landscape phone, 400% zoom)', () => {
  for (const size of [
    { width: 844, height: 390 },
    { width: 320, height: 256 },
  ]) {
    for (const mode of ['reduced', 'lite'] as const) {
      test(`${size.width}x${size.height} ${mode}: the parked rider never covers the crossing copy`, async ({ page }) => {
        await page.setViewportSize(size);
        await useMode(page, mode);
        await page.goto('/');
        await page.locator('#crossing').scrollIntoViewIfNeeded();
        await page.waitForTimeout(700); // lite: let the 600 ms entry finish
        const overlap = await page.evaluate(() => {
          const r = document.querySelector('.crossing__vehicle')!.getBoundingClientRect();
          const c = document.querySelector('.crossing__copy')!.getBoundingClientRect();
          const w = Math.min(r.right, c.right) - Math.max(r.left, c.left);
          const h = Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top);
          return w > 0 && h > 0 ? Math.round(w * h) : 0;
        });
        expect(overlap).toBe(0);
      });
    }
  }
});

// ---------------------------------------------------------------- i: GSAP fallback

test.describe('GSAP fallback', () => {
  test.beforeEach(async ({ page }) => {
    await useMode(page, 'full');
  });

  async function loadGsap(page: Page) {
    const chunk = page.waitForRequest((r) => gsapChunk(r.url()));
    await page.goto('/?scrub=gsap');
    await chunk;
    await expect(page.locator('#crossing')).toHaveAttribute('data-scrub', 'gsap');
    // crossingScrub() has run once it clears the CSS parking translate.
    await page.waitForFunction(() => document.querySelector<HTMLElement>('.crossing__vehicle')!.style.translate === 'none');
    const g = await crossingGeometry(page);
    const samples = [];
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      await scrollToY(page, scrubY(g, p));
      samples.push({ p, ...(await settledProbe(page)) });
    }
    test.info().annotations.push({
      type: 'samples',
      description: samples
        .map((s) => `p=${s.p} x=${s.riderX.toFixed(1)} offset=${s.riderOffset.toFixed(1)} stretch=${s.stretch} cssAnims=${s.vehicleAnimations}`)
        .join(' | '),
    });
    return samples;
  }

  test('?scrub=gsap loads the chunk lazily and the rider moves left to right', async ({ page }) => {
    const samples = await loadGsap(page);
    for (let i = 1; i < samples.length; i++) expect(samples[i]!.riderX).toBeGreaterThan(samples[i - 1]!.riderX);
    expect(samples[0]!.riderX + samples[0]!.riderWidth).toBeLessThanOrEqual(1);
    expect(samples[samples.length - 1]!.riderX).toBeGreaterThanOrEqual(samples[0]!.stageWidth - 1);
  });

  // Regression: the CSS scroll-timeline rules must stand down under
  // data-scrub="gsap", or CSS `translate` and GSAP `transform` stack.
  test('?scrub=gsap: GSAP alone drives the rider (centred mid-scrub, no CSS animation)', async ({ page }) => {
    const samples = await loadGsap(page);
    const mid = samples[2]!;
    expect(mid.vehicleAnimations).toBe(0);
    expect(Math.abs(mid.riderOffset)).toBeLessThan(mid.stageWidth * 0.03);
  });

  test('chunk is not requested on a normal full-motion load (Chromium uses CSS)', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => {
      if (gsapChunk(r.url())) requested.push(r.url());
    });
    await page.goto('/');
    await afterIdle(page);
    const g = await crossingGeometry(page);
    for (const p of [0, 0.5, 1]) await scrollToY(page, scrubY(g, p));
    expect(requested).toEqual([]);
  });

  test('chunk is not requested in reduced mode', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requested: string[] = [];
    page.on('request', (r) => {
      if (gsapChunk(r.url())) requested.push(r.url());
    });
    await page.goto('/?scrub=gsap'); // even when forced
    await afterIdle(page);
    expect(requested).toEqual([]);
  });
});

// ---------------------------------------------------------------- j: JS budget

test('initial JS up to `load` is far below the 170 KB budget', async ({ page }, info) => {
  await useMode(page, 'full');
  const pending: Promise<{ url: string; body: number; gzip: number; transfer: number }>[] = [];
  let loaded = false;
  page.on('response', (res) => {
    if (loaded) return;
    const isJs = res.request().resourceType() === 'script' || /\.m?js(\?|$)/.test(res.url());
    if (!isJs) return;
    pending.push(
      (async () => {
        const body = await res.body();
        const sizes = await res.request().sizes();
        return { url: res.url(), body: body.length, gzip: gzipSync(body).length, transfer: sizes.responseBodySize + sizes.responseHeadersSize };
      })(),
    );
  });
  await page.goto('/', { waitUntil: 'load' });
  loaded = true;
  const files = await Promise.all(pending);
  const total = files.reduce((a, f) => ({ body: a.body + f.body, gzip: a.gzip + f.gzip, transfer: a.transfer + f.transfer }), {
    body: 0,
    gzip: 0,
    transfer: 0,
  });
  const line = `[${info.project.name}] initial JS: ${files.length} file(s), ${total.body} B raw, ~${total.gzip} B gzip, ${total.transfer} B transferred (incl. headers)`;
  console.log(line);
  info.annotations.push({ type: 'initial-js', description: line });
  expect(files.length).toBeGreaterThan(0);
  expect(files.some((f) => isGsapUrl(f.url))).toBe(false);
  // Budget is 170 KB gzip; "far below" = under a tenth of it even uncompressed.
  expect(total.body).toBeLessThan(17 * 1024);
});

function isGsapUrl(url: string) {
  return gsapChunk(url) || /gsap/i.test(url);
}
