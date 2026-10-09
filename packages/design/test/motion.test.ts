// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  animate,
  applyMotionAttributes,
  brakeEase,
  cubicBezier,
  detectMotion,
  getMotionPreference,
  setMotionPreference,
  staggerDelay,
  stripMotion,
} from '../src/motion.ts';

function fakeWindow(opts: { reduce?: boolean; saveData?: boolean; effectiveType?: string; deviceMemory?: number }) {
  return {
    matchMedia: (q: string) => ({ matches: q.includes('reduce') && !!opts.reduce }),
    navigator: {
      connection: { saveData: opts.saveData, effectiveType: opts.effectiveType },
      deviceMemory: opts.deviceMemory,
    },
  } as unknown as Window;
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('detectMotion', () => {
  it('is full motion on a capable device with no preferences', () => {
    expect(detectMotion('system', fakeWindow({ effectiveType: '4g', deviceMemory: 8 }))).toEqual({
      reducedMotion: false,
      lite: false,
    });
  });

  it('honours the OS reduced-motion setting and the footer toggle', () => {
    expect(detectMotion('system', fakeWindow({ reduce: true })).reducedMotion).toBe(true);
    expect(detectMotion('reduced', fakeWindow({})).reducedMotion).toBe(true);
  });

  it.each([
    [{ saveData: true }],
    [{ effectiveType: '2g' }],
    [{ effectiveType: 'slow-2g' }],
    [{ deviceMemory: 2 }],
    [{ deviceMemory: 0.5 }],
  ])('switches to lite mode for %o', (o) => {
    expect(detectMotion('system', fakeWindow(o)).lite).toBe(true);
  });

  it('stays out of lite mode on 3g with 4 GB', () => {
    expect(detectMotion('system', fakeWindow({ effectiveType: '3g', deviceMemory: 4 })).lite).toBe(false);
  });
});

describe('motion preference', () => {
  it('round-trips through storage and sets data attributes', () => {
    expect(getMotionPreference()).toBe('system');
    setMotionPreference('reduced');
    expect(getMotionPreference()).toBe('reduced');
    expect(document.documentElement.dataset.motion).toBe('reduced');
    setMotionPreference('system');
    expect(getMotionPreference()).toBe('system');
  });

  it('falls back to system when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getMotionPreference()).toBe('system');
  });

  it('sets and clears the lite attribute', () => {
    const el = document.createElement('html');
    applyMotionAttributes(el, { reducedMotion: false, lite: true });
    expect(el.hasAttribute('data-lite')).toBe(true);
    applyMotionAttributes(el, { reducedMotion: false, lite: false });
    expect(el.hasAttribute('data-lite')).toBe(false);
  });
});

describe('staggerDelay', () => {
  it('steps by the token', () => {
    expect(staggerDelay(0, 's1')).toBe(0);
    expect(staggerDelay(3, 's2')).toBe(144);
    expect(staggerDelay(5, 's3')).toBe(400);
  });

  it('stops animating cards after the first 6', () => {
    expect(staggerDelay(6, 's3')).toBeNull();
  });
});

describe('reduced motion keyframes', () => {
  it('keeps opacity and drops transforms', () => {
    expect(
      stripMotion([
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'none' },
      ]),
    ).toEqual([{ opacity: 0 }, { opacity: 1 }]);
  });

  it('animate() does nothing when only transforms were asked for', () => {
    const el = document.createElement('div');
    el.animate = vi.fn();
    const out = animate(el, [{ transform: 'scale(1)' }, { transform: 'scale(0.97)' }], {
      env: { reducedMotion: true, lite: false },
    });
    expect(out).toBeNull();
    expect(el.animate).not.toHaveBeenCalled();
  });

  it('animate() maps token names to WAAPI timing', () => {
    const el = document.createElement('div');
    el.animate = vi.fn(() => ({}) as Animation);
    animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 'quick', easing: 'settle', env: { reducedMotion: false, lite: false } });
    expect(el.animate).toHaveBeenCalledWith(expect.any(Array), {
      duration: 160,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      delay: 0,
      fill: 'both',
    });
  });
});

describe('cubicBezier', () => {
  it('is the identity for a linear curve', () => {
    const lin = cubicBezier(0, 0, 1, 1);
    for (const t of [0, 0.1, 0.5, 0.9, 1]) expect(lin(t)).toBeCloseTo(t, 4);
  });

  it('matches CSS ease (.25,.1,.25,1) at the midpoint', () => {
    // Reference value from the CSS ease curve: y(0.5) ~= 0.8024.
    expect(cubicBezier(0.25, 0.1, 0.25, 1)(0.5)).toBeCloseTo(0.8024, 3);
  });

  it('brake is front-loaded and monotonic', () => {
    expect(brakeEase(0.2)).toBeGreaterThan(0.6);
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.01) {
      const y = brakeEase(t);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
    expect(brakeEase(1)).toBe(1);
  });
});
