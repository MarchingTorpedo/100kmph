# 100kmph Motion Spec v1

Motion thesis: **everything is measured against 100.** Heavy motion on the landing page is the engine at full throttle. Everywhere else it is the same engine at a steady 100 km/h: present, calm, never in the way of the garment.

## 1. Brand personality

**Fast, exact, rugged, proud, warm.** Fast is felt in timing, not blur. Exact means numbers (GSM, stitches, km) are shown as facts. Rugged is road dust, not gym. Proud is Indian highway culture. Warm means a rider you'd talk to at a chai stop.

**Not:** a racing-game HUD, neon cyberpunk, luxury-fashion hush, streetwear irony, or a tech demo that makes 4G users wait.

## 2. Design tokens

**Palette** (dark is the landing default; light for product, cart, account)

| Token | Dark | Light | Use |
|---|---|---|---|
| ground | #12161F | #E8EBEF | page |
| surface | #1B212D | #FFFFFF | panels, drawers |
| ink | #F1F3F6 | #151A24 | text |
| muted | #8E98A8 | #5A6577 | secondary text (4.5:1 checked) |
| milestone (accent) | #F2B705 | #B07F00 | highway-stone yellow: needle, counter, CTA |
| route | #3DB5A4 | #16796B | tracking line, success |
| brake | #E5484D | #C2262B | errors only |

The accent comes from Indian national-highway kilometre stones, not from a default "racing red". Light-mode accent is darkened for text contrast; use #F2B705 as fill behind #151A24 text.

**Type** (self-host, Latin subset, `font-display: swap`, preload only Archivo)
- **Archivo (variable: wght 500-800, wdth 75-125).** One file gives us the width axis, which powers the signature element. Ship ~38 KB woff2. Use tabular figures for every number.
- **Newsreader (400, 400 italic).** A text serif for fabric and craft copy. It reads as woven and tactile against Archivo's machined look. ~28 KB for both. Line-height 1.6, 62ch max.
- Scale (1.25 ratio, clamp): 14, 16, 20, 25, 31, 39, 61, 96-220 (ghost numerals only). Sentence case; no tracked all-caps labels.

**Spacing:** 4, 8, 12, 16, 24, 32, 48, 64, 96, 144.
**Radii:** 0 (photography), 4 (inputs), 10 (buttons, drawers), 999 (status chips), and the **milestone shape** (top corners 14, bottom 0) for tags and the counter.

**Motion tokens**
- Durations: `tick` 90 ms, `quick` 160, `base` 280, `slow` 480, `scene` 800, `epic` 1400 (landing only).
- Easings: `launch` cubic-bezier(.7,0,.2,1) (accelerating); `brake` cubic-bezier(.05,.7,.1,1) (fast then settles, default for entrances); `settle` cubic-bezier(.2,.8,.2,1) (UI); `linear` only for gauges and scrub.
- Stagger: `s1` 24 ms (text lines), `s2` 48 ms (list items), `s3` 80 ms (cards, max 6 items).
- Rule: animate only transform and opacity (plus clip-path on landing). No layout properties.

## 3. Landing page: 7 scenes

Shared rules: GSAP core + ScrollTrigger (~40 KB gz) loaded after hydration via dynamic import; no Three.js on landing. One scrolling timeline, no scroll-jacking: the user always scrolls natively. Reduced-motion = every scene becomes a static composed frame. Save-Data/2g/`deviceMemory<=2` = "lite" mode: no video, no pinning, CSS-only reveals.

**1. Ignition (loader + hero)**
- Purpose: say speed in the first second.
- Sees: poster of a dark road at dusk is already visible (it is the LCP image). An SVG speedometer arc overlays it; the needle sweeps 0 to 100 in 1.2 s, the counter ticks, then a milestone-yellow light sweep wipes across and the gauge dissolves into the headline.
- Tech: inline SVG + WAAPI (no library needed), ~2 KB. Hero video (muted loop, 5 s) swaps in after `load` and only on good connections.
- Assets: poster AVIF 1280w <= 60 KB (WebP fallback), video <= 1.4 MB (H.264 720p + AV1 if smaller).
- Cost: GPU light; video decode is the real cost.
- Fallback: static poster with a static needle at 100; headline fades with `brake` in 280 ms (no sweep).

**2. The crossing (scroll-driven vehicle)**
- Purpose: show the brand's speed in one memorable image.
- Sees: an oversized ghost numeral "100" sits behind; a generic rider silhouette crosses left to right in front of it, with horizontal speed streaks that fade out. The numeral's width axis stretches as the vehicle passes the middle.
- Interaction: scrubbed to scroll across 1.5 viewport heights; pinned for the middle 40%.
- Tech: GSAP ScrollTrigger, transform only; the silhouette is one SVG (~6 KB). Feature-detect CSS `animation-timeline: view()` and use it first, GSAP as fallback.
- Assets: rider SVG, streak SVG; no photo.
- Cost: low (two composited layers).
- Fallback: vehicle parked mid-frame, numeral at rest width; lite mode plays a single 600 ms translate on enter.

**3. Gear shift (hero to story transition)**
- Purpose: dynamic transition that is not a fade.
- Sees: the section edge slices diagonally (clip-path) as a yellow bar slides through.
- Tech: CSS clip-path + scrub; cost low. Fallback: hard cut, 160 ms opacity.

**4. Under the lens (fabric and craft)**
- Purpose: prove this is a clothing brand.
- Sees: macro weave fills the screen, then scroll "zooms out" to a garment; three callouts pin to the fabric as it settles (weight in GSM, stitches per inch, dye method), each in a milestone-shaped tag.
- Interaction: scrubbed scale 2.4 to 1, callouts pop in at 25/50/75% with `s2` stagger.
- Tech: GSAP, one image per breakpoint, two resolutions (macro and garment) crossfaded at 40% to avoid upscale blur. Callout copy in Newsreader italic.
- Assets: macro fabric AVIF 1600w <= 140 KB; garment AVIF <= 120 KB.
- Cost: medium (large image transform); cap scale at 2.4.
- Fallback: two stacked stills and the callouts as plain captions.

**5. Collections reveal**
- Purpose: show the range with chapters.
- Sees: three full-height panels stack as you scroll; each name is large Archivo, and its width axis relaxes from 125 to 100 as the panel settles; the image wipes in with clip-path.
- Interaction: tap a panel to open the collection (shared-element transition via View Transitions API where available).
- Tech: ScrollTrigger sticky stack, 3 panels only. Cost: medium. Assets: 3 x AVIF 1000w <= 90 KB.
- Fallback: vertical list of three image cards, no stacking.

**6. Follow your jacket (tracking teaser)**
- Purpose: tie the brand to the live-tracking promise.
- Sees: a stylised route line draws from a warehouse dot to a city dot; a jacket icon travels along it; the milestone counter reads kilometres left.
- Tech: SVG `stroke-dashoffset` driven by scroll; Cost: very low. No real map tiles here.
- Fallback: completed route drawn, icon at destination.

**7. Finish (closing CTA)**
- Purpose: convert.
- Sees: the scroll counter reaches 100 and locks; the headline settles at width 100; one yellow CTA ("Shop the collection"). Footer is calm.
- Interaction: button press scales to 0.97 in `tick`, release `settle`.
- Tech: CSS only. Cost: none. Fallback: identical, no animation.

## 4. Same language, dialed down

| Page | Allowed motion | Forbidden motion |
|---|---|---|
| Collection | Staggered grid entrance (`s3`, first 6 only, 280 ms); hover image swap to back view; filter chips with `quick` transitions; counter in the header showing result count | Pinning, parallax, vehicle silhouettes, width-axis stretching on scroll |
| Product | Fabric zoom on tap or pinch with detail callouts (user-triggered); gallery swipe; size/colour selection feedback; add-to-cart confirmation (`base`) | Autoplay video above the fold, scroll-jacking, ghost numerals, anything that moves while the user reads the description |
| Cart | Line-item add/remove (`quick`), total number tick (tabular figures), free-shipping progress bar | Page-wide transitions, decorative motion, loops |
| Tracking | Route line draw on load (`slow` once), marker moving along path in real time, slide-in detail drawer (`base`, `brake`), status chip colour change | Fake movement when no data arrives; bouncing icons; any animation that implies an ETA the system does not have |
| Account | Form validation feedback, order list expand/collapse, skeleton shimmer under 1 s | Everything else; the page is a tool |

Global: route changes use a 160 ms crossfade, no slides. `prefers-reduced-motion` removes all transforms and keeps opacity and colour changes only. Save-Data removes video and parallax everywhere.

## 5. Signature element: Velocity Width

A headline's letterforms physically stretch with your speed. Archivo's width axis runs 75 (compressed) to 125 (stretched); at rest every headline is exactly **wdth 100**.
- On the landing page, up to 4 display headings map scroll velocity to width: `wdth = 100 + clamp(velocity / 40, -25, +25)`, smoothed with a 120 ms ease so it looks like inertia, and returning to 100 within 480 ms (`brake`) when scrolling stops.
- Fast scroll down stretches; fast scroll up compresses; stopping always lands on 100. So "100" is literally the resting state.
- Deeper pages use it only once per page, on load: the page title enters at wdth 125 and settles to 100 in 480 ms.
- Companion: the **milestone counter**, a small milestone-shaped tag fixed to the viewport edge that shows scroll progress as 0 to 100. On tracking it shows kilometres remaining instead.
- Fallback: reduced-motion or lite mode locks wdth 100; the counter still shows as static text.

## 6. Asset production list

| Asset | Who | Target |
|---|---|---|
| Hero poster (road at dusk, rider from behind, no identifiable brand/model) | Client shoot or licensed | AVIF <= 60 KB, 1280w; WebP <= 90 KB |
| Hero loop video, 5 s | We edit from client footage | <= 1.4 MB, 720p, no audio |
| Rider and vehicle silhouettes (generic, 2 variants), speed streaks | We draw | SVG <= 8 KB each |
| Macro fabric photos (3 garments, weave and stitch close-ups) | Client | AVIF 1600w <= 140 KB each |
| Garment hero shots on neutral ground, 4 views per product | Client | AVIF 900w <= 80 KB; 600w <= 45 KB |
| 3 collection hero images | Client | AVIF 1000w <= 90 KB |
| Gauge, route and icon SVGs | We create | <= 15 KB total |
| Fonts | Google Fonts, self-hosted | ~66 KB total |

## 7. Risks

1. **LCP vs. loader.** The gauge must never hide the poster; it sits on top and caps at 1.4 s. Measure in CI on throttled mid-range Android.
2. **JS budget creep.** GSAP plus a 3D library would break 170 KB. Mitigation: no Three.js at launch; landing-only chunk; bundle-size check in CI.
3. **Low-end jank from big images scaled in scrub scenes.** Cap scale and layers; use lite mode via Save-Data and `deviceMemory`.
4. **Client footage quality and rights.** Late or weak photography makes the fabric scene fail. Get macro samples in week 1.
5. **Motion sickness and accessibility.** Velocity Width and streaks need reduced-motion handling and a user toggle in the footer.
6. **Brand-lookalike risk.** Silhouettes must stay generic; legal check before any vehicle photo is used.
7. **Tracking trust.** Animated markers must reflect real data only.
