# @100kmph/design

Design tokens, self-hosted fonts and motion utilities, implementing section 2
and section 5 of [`docs/motion-spec.md`](../../docs/motion-spec.md).

## Use

```css
@import '@100kmph/design/styles/tokens.css';
@import '@100kmph/design/styles/fonts.css';
@import '@100kmph/design/styles/base.css';
```

```html
<html data-theme="dark"> <!-- landing; light is the default -->
<link rel="preload" href="/fonts/archivo-text-latin.woff2" as="font" type="font/woff2" crossorigin>
```

```ts
import { detectMotion, applyMotionAttributes, animate, staggerDelay } from '@100kmph/design/motion';
import { velocityWidth, settleWidth } from '@100kmph/design/velocity-width';

const env = detectMotion();
applyMotionAttributes(document.documentElement, env);

velocityWidth([...document.querySelectorAll<HTMLElement>('.display')]); // landing, max 4
settleWidth(document.querySelector('h1.display')!); // deeper pages, once
```

The package ships TypeScript source, with no build step. `styles/tokens.css` is
generated from `src/tokens.ts`:

```sh
pnpm --filter @100kmph/design build:css   # regenerate after editing tokens.ts
pnpm check                                # CI: fails if tokens.css is stale
```

Open `specimen.html` over HTTP (e.g. `python -m http.server` in this folder)
to see the tokens and fonts.

## What's here

| File | Contents |
|---|---|
| `src/tokens.ts` | Palette (dark/light), type scale, spacing, radii, milestone shape, durations, easings, staggers |
| `src/motion.ts` | Motion tier (`reducedMotion`, `lite`), footer toggle storage, token-aware WAAPI `animate()`, `staggerDelay()`, `cubicBezier()` |
| `src/velocity-width.ts` | Scroll-velocity heading width (landing) and `settleWidth()` title entrance (other pages) |
| `styles/base.css` | Body defaults, `.display`, `.prose`, `.milestone`, `.ghost-numeral`, `.reveal`, `.press`, route crossfade |
| `fonts/` | woff2 files and their OFL licences, built by `scripts/build-fonts.py` |

## Fonts: departure from the spec

Archivo is split into two files because the width axis roughly doubles the file size:

| File | Axes | Size | Loaded |
|---|---|---|---|
| `archivo-text-latin.woff2` | wght 500-800, wdth 100 | 28.9 KB | preloaded, all UI text |
| `archivo-display-latin.woff2` | wght 800, wdth 75-125 | 33.0 KB | `.display` headings only |
| `newsreader-400-latin.woff2` | 400 | 20.4 KB | prose |
| `newsreader-400-italic-latin.woff2` | 400 italic | 21.9 KB | prose |

The spec's "~38 KB" for Archivo matches the **weight-only** file (Google
Fonts serves 34.1 KB for it). A single file with both axes is 74.8 KB here
(88.0 KB from Google). Splitting brings the total to 62 KB and the preload to
29 KB. The total for all fonts is about 104 KB against the spec's ~66 KB. All
sizes were measured on 2026-10-10.

Display headings use weight 800 only. That was my choice; the spec doesn't name a weight.

Subset: Google's Latin set plus ₹ (U+20B9). Features kept: kerning,
ligatures, `tnum`, `lnum`, `case`.

## Open: palette contrast

The spec says the palette was checked at 4.5:1. `test/tokens.test.ts` finds
these text pairings below WCAG AA (4.5:1):

| Pairing | Ratio | Nearest same-hue value that passes |
|---|---|---|
| light `milestone` #B07F00 on ground / surface | 2.99 / 3.57 | #896300 (4.56 / 5.46) |
| light `route` #16796B on ground | 4.41 | #167769 (4.53) |
| dark `brake` #E5484D on surface | 4.12 | #E7565A (4.51 / 5.06) |

Until decided, don't set body-size text in light `milestone`. It is fine as a
fill (`milestone-fill` behind `on-milestone` text is 9.58:1).

## Unverified

- Velocity Width assumes velocity in px/s (the spec gives `velocity / 40`
  without a unit), which saturates at 1000 px/s. Tune it on real devices.
- Fallback-font metric overrides were computed against Windows' Arial and
  Times New Roman. They are not checked against Android's Roboto/Noto fallbacks.
