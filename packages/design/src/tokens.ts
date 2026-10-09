/**
 * 100kmph design tokens. Single source of truth; values come from
 * docs/motion-spec.md section 2. `styles/tokens.css` is generated from this
 * file (`pnpm --filter @100kmph/design build:css`), never edited by hand.
 */

export const themes = ['dark', 'light'] as const;
export type Theme = (typeof themes)[number];

export const colorRoles = [
  'ground',
  'surface',
  'ink',
  'muted',
  'milestone',
  'milestone-fill',
  'on-milestone',
  'route',
  'brake',
] as const;
export type ColorRole = (typeof colorRoles)[number];

/**
 * - milestone: accent for text, strokes, the needle and counter.
 * - milestone-fill / on-milestone: CTA fill and the text on it. The spec says
 *   to use #F2B705 as fill behind #151A24 text in both themes.
 * - brake: errors only.
 */
export const color: Record<Theme, Record<ColorRole, string>> = {
  dark: {
    ground: '#12161F',
    surface: '#1B212D',
    ink: '#F1F3F6',
    muted: '#8E98A8',
    milestone: '#F2B705',
    'milestone-fill': '#F2B705',
    'on-milestone': '#151A24',
    route: '#3DB5A4',
    brake: '#E5484D',
  },
  light: {
    ground: '#E8EBEF',
    surface: '#FFFFFF',
    ink: '#151A24',
    muted: '#5A6577',
    milestone: '#B07F00',
    'milestone-fill': '#F2B705',
    'on-milestone': '#151A24',
    route: '#16796B',
    brake: '#C2262B',
  },
};

/** Landing is dark; product, cart and account pages are light. */
export const defaultTheme: Theme = 'light';

export const font = {
  /** Archivo text cut: wght 500-800 at wdth 100. Preloaded. */
  sans: "'Archivo', 'Archivo Fallback', system-ui, sans-serif",
  /** Archivo display cut: wght 800, wdth 75-125. Velocity Width headings only. */
  display: "'Archivo Display', 'Archivo', 'Archivo Fallback', system-ui, sans-serif",
  /** Newsreader 400 / 400 italic: fabric and craft copy. */
  serif: "'Newsreader', 'Newsreader Fallback', Georgia, serif",
} as const;

export const fontWeight = { medium: 500, semibold: 600, bold: 700, heavy: 800 } as const;

/** Width axis. Every headline rests at exactly 100. */
export const fontWidth = { min: 75, rest: 100, max: 125 } as const;

/**
 * Type scale (1.25 ratio) in px. The upper steps are fluid between the
 * previous step at a 360px viewport and their own size at 1280px.
 */
export const typeScale = {
  xs: { px: 14 },
  sm: { px: 16 },
  md: { px: 20 },
  lg: { px: 25 },
  xl: { px: 31, minPx: 25 },
  '2xl': { px: 39, minPx: 31 },
  '3xl': { px: 61, minPx: 39 },
  /** Ghost numerals only (the "100" behind the crossing scene). */
  ghost: { px: 220, minPx: 96 },
} as const satisfies Record<string, { px: number; minPx?: number }>;
export type TypeStep = keyof typeof typeScale;

export const fluidRange = { minViewport: 360, maxViewport: 1280 } as const;

export const lineHeight = { tight: 1.05, heading: 1.15, ui: 1.4, prose: 1.6 } as const;

/** Max line length for Newsreader prose. */
export const measure = '62ch';

export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  7: 48,
  8: 64,
  9: 96,
  10: 144,
} as const;

export const radius = {
  /** Photography. */
  none: 0,
  /** Inputs. */
  input: 4,
  /** Buttons, drawers. */
  control: 10,
  /** Status chips. */
  pill: 999,
} as const;

/** Milestone shape for tags and the counter: top corners 14, bottom 0. */
export const milestoneShape = { top: 14, bottom: 0 } as const;

/** Durations in ms. `epic` is landing only. */
export const duration = {
  tick: 90,
  quick: 160,
  base: 280,
  slow: 480,
  scene: 800,
  epic: 1400,
} as const;
export type DurationName = keyof typeof duration;

export const easing = {
  /** Accelerating. */
  launch: 'cubic-bezier(.7,0,.2,1)',
  /** Fast then settles; the default for entrances. */
  brake: 'cubic-bezier(.05,.7,.1,1)',
  /** UI feedback. */
  settle: 'cubic-bezier(.2,.8,.2,1)',
  /** Gauges and scroll scrub only. */
  linear: 'linear',
} as const;
export type EasingName = keyof typeof easing;

/** Stagger steps in ms, with the item cap the spec allows for each. */
export const stagger = {
  /** Text lines. */
  s1: { step: 24, max: Infinity },
  /** List items. */
  s2: { step: 48, max: Infinity },
  /** Cards, max 6 items. */
  s3: { step: 80, max: 6 },
} as const;
export type StaggerName = keyof typeof stagger;
