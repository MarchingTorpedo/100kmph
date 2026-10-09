// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  IDLE_MS,
  MAX_HEADINGS,
  brakeWidth,
  settleWidth,
  smoothWidth,
  velocityToWidth,
  velocityWidth,
} from '../src/velocity-width.ts';

describe('velocityToWidth', () => {
  it.each([
    [0, 100],
    [400, 110],
    [-400, 90],
    [1000, 125],
    [5000, 125],
    [-5000, 75],
  ])('%d px/s -> wdth %d', (v, w) => {
    expect(velocityToWidth(v)).toBe(w);
  });
});

describe('smoothing and brake', () => {
  it('moves about 63% toward the target in one time constant', () => {
    expect(smoothWidth(100, 125, 120)).toBeCloseTo(100 + 25 * (1 - Math.exp(-1)), 6);
  });

  it('brakes back to exactly 100 in 480 ms', () => {
    expect(brakeWidth(125, 0)).toBe(125);
    expect(brakeWidth(125, 480)).toBe(100);
    expect(brakeWidth(80, 1000)).toBe(100);
  });
});

/** A window with a controllable clock, scroll position and rAF queue. */
function harness() {
  let now = 0;
  let queue: FrameRequestCallback[] = [];
  const listeners: (() => void)[] = [];
  const win = {
    scrollY: 0,
    requestAnimationFrame: (cb: FrameRequestCallback) => (queue.push(cb), queue.length),
    cancelAnimationFrame: () => {
      queue = [];
    },
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: vi.fn(),
  } as unknown as Window & typeof globalThis;
  const tick = (ms = 16) => {
    now += ms;
    const q = queue;
    queue = [];
    q.forEach((cb) => cb(now));
  };
  const scrollBy = (dy: number) => {
    (win as { scrollY: number }).scrollY += dy;
    listeners.forEach((fn) => fn());
  };
  return { win, tick, scrollBy, running: () => queue.length > 0 };
}

const stretch = (el: HTMLElement) => parseFloat(el.style.getPropertyValue('font-stretch') || '100');

describe('velocityWidth controller', () => {
  const env = { reducedMotion: false, lite: false };

  it('stretches on fast scroll down, then settles to 100 and stops the loop', () => {
    const h = harness();
    const el = document.createElement('h2');
    velocityWidth([el], { win: h.win, env });

    for (let i = 0; i < 10; i++) {
      h.scrollBy(32); // 2000 px/s
      h.tick();
    }
    expect(stretch(el)).toBeGreaterThan(115);

    for (let t = 0; t < IDLE_MS + 480 + 64; t += 16) h.tick();
    expect(stretch(el)).toBe(100);
    expect(h.running()).toBe(false);
  });

  it('compresses on fast scroll up', () => {
    const h = harness();
    const el = document.createElement('h2');
    velocityWidth([el], { win: h.win, env });
    (h.win as { scrollY: number }).scrollY = 5000;
    h.scrollBy(0);
    h.tick();
    for (let i = 0; i < 10; i++) {
      h.scrollBy(-32);
      h.tick();
    }
    expect(stretch(el)).toBeLessThan(85);
  });

  it('ignores jumps (anchor links, scrollBy) instead of reading them as speed', () => {
    const h = harness();
    const el = document.createElement('h2');
    velocityWidth([el], { win: h.win, env });
    h.scrollBy(1);
    h.tick();
    h.scrollBy(600); // 37,500 px/s in one frame: a jump, not a scroll
    h.tick();
    expect(stretch(el)).toBe(100);
    for (let t = 0; t < 200; t += 16) h.tick();
    expect(h.running()).toBe(false);
  });

  it('does nothing under reduced motion or lite mode', () => {
    for (const e of [{ reducedMotion: true, lite: false }, { reducedMotion: false, lite: true }]) {
      const h = harness();
      const el = document.createElement('h2');
      velocityWidth([el], { win: h.win, env: e });
      h.scrollBy(500);
      h.tick();
      expect(h.running()).toBe(false);
      expect(stretch(el)).toBe(100);
    }
  });

  it(`moves at most ${MAX_HEADINGS} headings`, () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = harness();
    const els = Array.from({ length: 6 }, () => document.createElement('h2'));
    velocityWidth(els, { win: h.win, env });
    for (let i = 0; i < 5; i++) {
      h.scrollBy(40);
      h.tick();
    }
    expect(els.slice(0, MAX_HEADINGS).every((e) => stretch(e) > 100)).toBe(true);
    expect(els.slice(MAX_HEADINGS).every((e) => stretch(e) === 100)).toBe(true);
  });

  it('cleanup resets headings to rest', () => {
    const h = harness();
    const el = document.createElement('h2');
    const stop = velocityWidth([el], { win: h.win, env });
    h.scrollBy(40);
    h.tick();
    h.scrollBy(40);
    h.tick();
    stop();
    expect(stretch(el)).toBe(100);
  });
});

describe('settleWidth', () => {
  it('animates 125% to 100% with slow + brake', () => {
    const el = document.createElement('h1');
    el.animate = vi.fn(() => ({}) as Animation);
    settleWidth(el, { reducedMotion: false, lite: false });
    expect(el.animate).toHaveBeenCalledWith([{ fontStretch: '125%' }, { fontStretch: '100%' }], {
      duration: 480,
      easing: 'cubic-bezier(.05,.7,.1,1)',
    });
  });

  it('is skipped under reduced motion', () => {
    const el = document.createElement('h1');
    el.animate = vi.fn();
    expect(settleWidth(el, { reducedMotion: true, lite: false })).toBeNull();
    expect(el.animate).not.toHaveBeenCalled();
  });
});
