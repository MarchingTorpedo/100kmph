// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  animate,
  applyMotionAttributes,
  brakeEase,
  cubicBezier,
  detectMotion,
  getMotionPreference,
  onMotionChange,
  resetMotionPreferenceForTests,
  setMotionPreference,
  staggerDelay,
  stripMotion,
} from '../src/motion.ts';
import { motionBootScript } from '../src/boot.ts';

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
  resetMotionPreferenceForTests();
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

describe('motionBootScript', () => {
  const cases = [
    { reduce: false, stored: null, saveData: false, effectiveType: '4g', deviceMemory: 8 },
    { reduce: true, stored: null, saveData: false, effectiveType: '4g', deviceMemory: 8 },
    { reduce: false, stored: 'reduced', saveData: false, effectiveType: '4g', deviceMemory: 8 },
    { reduce: false, stored: null, saveData: true, effectiveType: '4g', deviceMemory: 8 },
    { reduce: false, stored: null, saveData: false, effectiveType: 'slow-2g', deviceMemory: 8 },
    { reduce: false, stored: null, saveData: false, effectiveType: '3g', deviceMemory: 2 },
    { reduce: true, stored: 'reduced', saveData: true, effectiveType: '2g', deviceMemory: 1 },
    { reduce: false, stored: null, saveData: undefined, effectiveType: undefined, deviceMemory: undefined },
  ];

  it.each(cases)('agrees with detectMotion for %o', (c) => {
    const root = document.documentElement;
    delete root.dataset.motion;
    delete root.dataset.lite;
    if (c.stored) localStorage.setItem('100kmph:motion', c.stored);
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce') && c.reduce })) as typeof window.matchMedia;
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: c.saveData, effectiveType: c.effectiveType },
      configurable: true,
    });
    Object.defineProperty(navigator, 'deviceMemory', { value: c.deviceMemory, configurable: true });

    new Function(motionBootScript)();
    const expected = detectMotion();
    expect(root.dataset.motion === 'reduced').toBe(expected.reducedMotion);
    expect(root.hasAttribute('data-lite')).toBe(expected.lite);
  });
});

describe('onMotionChange', () => {
  it('fires with the new environment when the footer toggle changes', () => {
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    const seen: boolean[] = [];
    const off = onMotionChange((env) => seen.push(env.reducedMotion));
    setMotionPreference('reduced');
    setMotionPreference('system');
    off();
    setMotionPreference('reduced');
    expect(seen).toEqual([true, false]);
  });

  it('keeps the toggle choice when storage is blocked', () => {
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const seen: boolean[] = [];
    const off = onMotionChange((env) => seen.push(env.reducedMotion));
    setMotionPreference('reduced');
    off();
    expect(seen).toEqual([true]);
  });
});

describe('blocked storage and other tabs', () => {
  const quietMedia = () =>
    (window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia);

  it('the toggle works both ways when storage throws', () => {
    quietMedia();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const seen: boolean[] = [];
    const off = onMotionChange((env) => seen.push(env.reducedMotion));
    setMotionPreference('reduced');
    expect(getMotionPreference()).toBe('reduced');
    setMotionPreference('system');
    expect(getMotionPreference()).toBe('system');
    off();
    expect(seen).toEqual([true, false]);
  });

  it('follows a change made in another tab', () => {
    quietMedia();
    const seen: boolean[] = [];
    const off = onMotionChange((env) => seen.push(env.reducedMotion));
    window.dispatchEvent(new StorageEvent('storage', { key: '100kmph:motion', newValue: 'reduced' }));
    expect(getMotionPreference()).toBe('reduced');
    window.dispatchEvent(new StorageEvent('storage', { key: '100kmph:motion', newValue: null }));
    off();
    expect(seen).toEqual([true, false]);
    expect(getMotionPreference()).toBe('system');
  });

  it('falls back to addListener on old Safari', () => {
    const added: unknown[] = [];
    window.matchMedia = (() => ({ matches: false, addListener: (f: unknown) => added.push(f), removeListener() {} })) as unknown as typeof window.matchMedia;
    const off = onMotionChange(() => {});
    off();
    expect(added).toHaveLength(1);
  });
});
