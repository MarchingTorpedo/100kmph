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
- Design system in `packages/design` (`@100kmph/design`): tokens (`src/tokens.ts` is the source; `styles/tokens.css` is generated and checked in CI), self-hosted fonts, motion utilities and Velocity Width, 60 unit tests. CI now runs install, typecheck, test and the tokens check. See `packages/design/README.md`.
- Open decisions for SKY: (a) four palette text pairings fail WCAG AA (light milestone, light route on ground, dark brake on surface); fixed candidates are in the design README; (b) fonts total ~104 KB vs the spec's ~66 KB because the width axis doubles Archivo; Archivo is split into a 29 KB preloaded text cut and a 33 KB display cut.
- Snapshot of the public shop taken locally: 188 products, 18 collections, 226 sitemap URLs, 691 product images. Many photos are 1024 px or less (stickers and keychains have one image; some hoodies and jerseys are 700 px). The landing fabric scene needs sharper macro photos than the shop has.
- Instagram (@100kmphofficial) is a possible source of brand photos only if needed, and only with the client's say-so.

## Next

1. Landing page scenes 1 and 2 (speedometer hero, rider crossing) as a working app on `@100kmph/design`, with a performance check (and real phone-width checks via mobile emulation) in CI.
2. One-week commerce spike: cart, Razorpay test payment, GST invoice, COD.
3. Import the snapshot into the catalogue model; build the redirect map from `urls.json`.

## Working style

SKY prefers clear step-by-step guidance and wants to be kept in the loop on what each helper agent is doing. Verify facts before stating them, and mark anything unverified.
