# 100kmph

Commerce, shipment tracking and ops platform for an apparel brand.

**Status:** early scaffold. Design direction and security baseline are written; the first build is the landing page and design system.

## What this will be

- A fast storefront that installs as an app on Android, iOS and Windows (PWA), with a high-energy landing page and calmer product pages.
- Shipment tracking with a status timeline and map, backed by carrier or aggregator data.
- Ops tools: shipment board, exceptions, hubs and carriers, roles and audit trail.
- A secure, scalable backend built as a modular monolith.

## Docs

| Doc | What it covers |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Windows setup, daily git routine |
| [docs/motion-spec.md](docs/motion-spec.md) | Design tokens, landing scenes, motion rules per page |
| [docs/security.md](docs/security.md) | Backend security and architecture |
| [docs/launch-checklist.md](docs/launch-checklist.md) | What is needed before and after launch |
| [SECURITY.md](SECURITY.md) | Reporting and contributor rules |

## Layout

```
apps/       storefront, ops
services/   api
packages/   contracts, config (more to come)
docs/
```

## Rights

All rights reserved. The code is public to read; no licence to reuse it is granted until one is added.
