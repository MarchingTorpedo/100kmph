# 100kmph: project briefing for Claude

Custom commerce, shipment-tracking and ops platform for 100kmph, an Indian motorcycle/automotive lifestyle clothing brand (100kmph.com, Pune, on Shopify today). Built by one developer (SKY) for the client. This file is read at the start of every Claude Code session.

## Hard rules

- **The repo is public.** Never commit secrets, real or sandbox API keys, customer data, order data, database dumps, or the client's images and product copy.
- `data-private/` is git-ignored and holds the shop snapshot. Keep it that way. Real values live in a local `.env`; only `.env.example` (fake values) is committed.
- Run `pnpm scan:secrets` (gitleaks) before every push. If a secret ever leaks, rotate it first.
- Demo data must be synthetic. Real customer data arrives from the client later, under a written agreement.
- No licence is set; the README says all rights reserved.
- Commit small and often, with `feat:`/`fix:`/`docs:`/`chore:` messages. Push at the end of every session.

## Decisions so far

- Dropping Shopify and building commerce ourselves (the client may not give Shopify access). Evaluating Medusa v2 as the commerce engine behind a thin boundary, with our own tracking and ops modules. Unverified until a one-week spike confirms Razorpay/Cashfree and GST support.
- TypeScript monorepo with pnpm workspaces: `apps/` (storefront, ops), `services/` (api), `packages/` (contracts, config, more later).
- Installable PWA covers Android, iOS and Windows. Native wrappers only if live rider GPS needs them.
- Modular monolith, Postgres with PostGIS, Redis, one payment gateway, one shipping aggregator behind an interface.
- Tracking launches with a status timeline plus a map; live rider GPS is not assumed. Handler contact is masked and only near delivery.
- Design and motion rules are in `docs/motion-spec.md`. Heavy motion on the landing page; the same language dialled down elsewhere. Budgets: LCP 2.5 s, initial JS 170 KB gzip on product/listing pages, hero video 1.4 MB, poster first, honour `prefers-reduced-motion` and Save-Data. No Three.js in v1.
- Security design is in `docs/security.md`; what the shop still needs is in `docs/launch-checklist.md`.

## Current state

- Scaffold, CI secret scan, Dependabot and docs are pushed.
- Design system in `packages/design` (`@100kmph/design`): tokens (`src/tokens.ts` is the source; `styles/tokens.css` is generated and checked in CI), self-hosted fonts, motion utilities and Velocity Width, 74 unit tests. CI now runs install, typecheck, test and the tokens check. See `packages/design/README.md`.
- Decided by SKY (2026-10-10): palette text colours adjusted so every text pairing meets WCAG AA (light milestone #896300, light route #167769, dark brake #E7565A; fills unchanged). Fonts stay at ~104 KB total, with Archivo split into a 29 KB preloaded text cut and a 33 KB display cut, so the width-axis headings work.
- Landing preview in `apps/storefront` (Astro 7): scenes 1 (Ignition) and 2 (Crossing) with placeholder poster, copy and rider. Initial JS 3 KB gzip; GSAP loads lazily only where CSS scroll timelines are missing. Lighthouse mobile median (5 runs, 2026-10-10): perf 100, LCP 1.53 s, TBT 15 ms, CLS 0, a11y 100. CI builds it, gates initial JS at 170 KB gzip, and runs 84 Playwright tests (Pixel 7, iPhone 13, desktop; full/reduced/lite). See `apps/storefront/README.md`.
- Known gaps: the placeholder poster is too low-detail to be the LCP element (the gauge counter is), so re-measure with the real poster; the real poster needs a portrait crop; Style & Layout is ~1.6 s of main-thread time under 4x throttling (suspect the animated counter; not yet investigated); only Chromium is tested.
- Snapshot of the public shop taken locally: 188 products, 18 collections, 226 sitemap URLs, 691 product images. Many photos are 1024 px or less (stickers and keychains have one image; some hoodies and jerseys are 700 px). The landing fabric scene needs sharper macro photos than the shop has.
- Instagram (@100kmphofficial) is a possible source of brand photos only if needed, and only with the client's say-so.

## Next

1. Get from the client: hero poster (landscape + portrait crop), footage, macro fabric photos (motion-spec section 6). Then re-measure LCP.
2. One-week commerce spike: cart, Razorpay test payment, GST invoice, COD.
3. Landing scenes 3 to 7, plus the milestone counter (motion-spec section 5).
4. Import the snapshot into the catalogue model; build the redirect map from `urls.json`.

## Working style

SKY prefers clear step-by-step guidance and wants to be kept in the loop on what each helper agent is doing. Verify facts before stating them, and mark anything unverified.
