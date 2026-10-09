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

```astro
---
import { motionBootScript } from '@100kmph/design/boot';
---
<!-- In <head>: sets data-motion / data-lite before first paint. -->
<script is:inline set:html={motionBootScript} />
```

```ts
import { detectMotion, applyMotionAttributes, animate, staggerDelay, onMotionChange } from '@100kmph/design/motion';
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
| `src/motion.ts` | Motion tier (`reducedMotion`, `lite`), footer toggle state (works with blocked storage, syncs across tabs), `onMotionChange()`, token-aware WAAPI `animate()`, `staggerDelay()`, `cubicBezier()` |
| `src/boot.ts` | `motionBootScript`: inline head script, kept in sync with `detectMotion` by tests |
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

## Palette contrast

The spec's palette was reported as checked at 4.5:1, but `test/tokens.test.ts`
found four text pairings below WCAG AA. They were adjusted to the nearest
same-hue value that passes (decided by SKY, 2026-10-10):

| Token | Spec value | Now | Ratio on ground / surface |
|---|---|---|---|
| light `milestone` | #B07F00 | #896300 | 4.56 / 5.46 |
| light `route` | #16796B | #167769 | 4.53 on ground |
| dark `brake` | #E5484D | #E7565A | 4.51 / 5.06 |

`milestone-fill` (#F2B705) is unchanged. It is a fill behind `on-milestone`
text (9.58:1), not a text colour. The test file keeps an empty
`KNOWN_FAILURES` set; add a name to it only as a deliberate exception.

## Unverified

- Velocity Width assumes velocity in px/s (the spec gives `velocity / 40`
  without a unit), which saturates at 1000 px/s. Tune it on real devices.
- Fallback-font metric overrides were computed against Windows' Arial and
  Times New Roman. They are not checked against Android's Roboto/Noto fallbacks.
