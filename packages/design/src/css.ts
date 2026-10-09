import {
  color,
  colorRoles,
  defaultTheme,
  duration,
  easing,
  fluidRange,
  font,
  fontWidth,
  fontWeight,
  lineHeight,
  measure,
  milestoneShape,
  radius,
  space,
  stagger,
  themes,
  typeScale,
  type Theme,
} from './tokens.ts';

const rem = (px: number) => `${+(px / 16).toFixed(4)}rem`;

/** clamp() that is `minPx` at the min viewport and `maxPx` at the max viewport. */
export function fluid(minPx: number, maxPx: number): string {
  const { minViewport, maxViewport } = fluidRange;
  const slope = (maxPx - minPx) / (maxViewport - minViewport);
  const intercept = minPx - slope * minViewport;
  return `clamp(${rem(minPx)}, ${rem(intercept)} + ${+(slope * 100).toFixed(4)}vw, ${rem(maxPx)})`;
}

const block = (selector: string, decls: [string, string | number][], extra: string[] = []) =>
  `${selector} {\n${[...extra, ...decls.map(([k, v]) => `--${k}: ${v};`)].map((l) => `  ${l}`).join('\n')}\n}\n`;

const themeBlock = (selector: string, theme: Theme) =>
  block(
    selector,
    colorRoles.map((role): [string, string] => [`color-${role}`, color[theme][role]]),
    [`color-scheme: ${theme};`],
  );

/** Renders every token as CSS custom properties. */
export function renderTokensCss(): string {
  const base: [string, string | number][] = [
    ['font-sans', font.sans],
    ['font-display', font.display],
    ['font-serif', font.serif],
    ...Object.entries(fontWeight).map(([k, v]): [string, number] => [`weight-${k}`, v]),
    ['width-min', fontWidth.min],
    ['width-rest', fontWidth.rest],
    ['width-max', fontWidth.max],
    ...Object.entries(typeScale).map(([k, s]): [string, string] => [
      `text-${k}`,
      'minPx' in s ? fluid(s.minPx, s.px) : rem(s.px),
    ]),
    ...Object.entries(lineHeight).map(([k, v]): [string, number] => [`leading-${k}`, v]),
    ['measure', measure],
    ...Object.entries(space).map(([k, v]): [string, string] => [`space-${k}`, rem(v)]),
    ...Object.entries(radius).map(([k, v]): [string, string] => [`radius-${k}`, `${v}px`]),
    ['radius-milestone', `${milestoneShape.top}px ${milestoneShape.top}px ${milestoneShape.bottom}px ${milestoneShape.bottom}px`],
    ...Object.entries(duration).map(([k, v]): [string, string] => [`duration-${k}`, `${v}ms`]),
    ...Object.entries(easing).map(([k, v]): [string, string] => [`ease-${k}`, v]),
    ...Object.entries(stagger).map(([k, v]): [string, string] => [`stagger-${k}`, `${v.step}ms`]),
  ];

  return [
    '/* Generated from src/tokens.ts by scripts/build-css.ts. Do not edit by hand. */\n',
    block(':root', base),
    themeBlock(`:root,\n[data-theme="${defaultTheme}"]`, defaultTheme),
    ...themes.filter((t) => t !== defaultTheme).map((t) => themeBlock(`[data-theme="${t}"]`, t)),
  ].join('\n');
}
