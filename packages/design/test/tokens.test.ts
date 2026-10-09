import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/contrast.ts';
import { fluid, renderTokensCss } from '../src/css.ts';
import { color, duration, easing, space, themes, type ColorRole, type Theme } from '../src/tokens.ts';

const AA_TEXT = 4.5;

/** Every colour we put text in, on every background it can sit on. */
const TEXT_ROLES: ColorRole[] = ['ink', 'muted', 'milestone', 'route', 'brake'];
const BACKGROUNDS: ColorRole[] = ['ground', 'surface'];

/**
 * Pairs that fail WCAG AA for body text. Empty since the palette was adjusted
 * (see packages/design/README.md). Add a name here only as a deliberate exception.
 */
const KNOWN_FAILURES = new Set<string>();

describe('palette contrast (WCAG 2.x)', () => {
  const cases = themes.flatMap((theme: Theme) =>
    TEXT_ROLES.flatMap((fg) => BACKGROUNDS.map((bg) => ({ theme, fg, bg, name: `${theme} ${fg} on ${bg}` }))),
  );

  it.each(cases.filter((c) => !KNOWN_FAILURES.has(c.name)))('$name meets 4.5:1', ({ theme, fg, bg }) => {
    expect(contrastRatio(color[theme][fg], color[theme][bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(cases.filter((c) => KNOWN_FAILURES.has(c.name)))(
    '$name is still a known failure (remove it from KNOWN_FAILURES once fixed)',
    ({ theme, fg, bg }) => {
      expect(contrastRatio(color[theme][fg], color[theme][bg])).toBeLessThan(AA_TEXT);
    },
  );

  it.each(themes)('%s: text on the milestone fill meets 4.5:1', (theme) => {
    expect(contrastRatio(color[theme]['on-milestone'], color[theme]['milestone-fill'])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('computes known reference ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
});

describe('spec values', () => {
  it('matches docs/motion-spec.md section 2', () => {
    expect(duration).toEqual({ tick: 90, quick: 160, base: 280, slow: 480, scene: 800, epic: 1400 });
    expect(Object.values(space)).toEqual([4, 8, 12, 16, 24, 32, 48, 64, 96, 144]);
    expect(easing.brake).toBe('cubic-bezier(.05,.7,.1,1)');
  });
});

describe('fluid()', () => {
  const evalAt = (expr: string, vw: number) => {
    const [, min, b, m, max] = expr.match(/clamp\(([\d.]+)rem, ([-\d.]+)rem \+ ([-\d.]+)vw, ([\d.]+)rem\)/)!.map(Number);
    // Returns px.
    return Math.min(max! * 16, Math.max(min! * 16, b! * 16 + (m! * vw) / 100));
  };

  it('hits the min size at 360px and the max size at 1280px, clamped outside', () => {
    const f = fluid(39, 61);
    expect(evalAt(f, 360)).toBeCloseTo(39, 1);
    expect(evalAt(f, 820)).toBeCloseTo(50, 1);
    expect(evalAt(f, 1280)).toBeCloseTo(61, 1);
    expect(evalAt(f, 320)).toBe(39);
    expect(evalAt(f, 1920)).toBe(61);
  });
});

describe('styles/tokens.css', () => {
  it('is in sync with src/tokens.ts', () => {
    const file = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(file).toBe(renderTokensCss());
  });
});
