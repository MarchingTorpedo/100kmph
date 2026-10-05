# Security and backend design

Target design for the backend. Items marked *(unverified)* come from an agent's review and need checking against current documentation before they are relied on.

## Decisions

- Commerce kernel: evaluate Medusa v2 for cart, orders, inventory and promotions behind a thin boundary; own code handles tracking and ops. Pin the version and verify payment-provider support first *(unverified)*.
- One Postgres instance, one schema per module. Modules talk through public APIs, never cross-schema joins.
- Modular monolith with two deployables: `api` and `worker`. Redis for queues, rate limits and pub/sub.

## Layout and boundaries

```
apps/       storefront, ops (later: rider, tracking)
services/   api, worker
packages/   domain (pure rules), contracts (zod schemas), config (env schema),
            identity, security, payments, tracking
infra/      deployment and backup scripts
```

Dependencies point inward only. `domain` imports nothing. Boundaries are enforced in CI with a dependency-rule linter. Strict TypeScript everywhere.

## Access and data

- Roles: customer, support, ops_hub, warehouse, rider, merchandiser, finance, admin. Every check goes through one `authorize(actor, action, resource)` function, deny by default.
- Row scoping in the application layer plus Postgres row-level security on PII and tracking tables. The app database role must not bypass RLS.
- PII: encrypted at rest, field-level encryption for phone, email and address with envelope keys, HMAC blind index for lookups. Masked by default in responses, logs and admin screens; revealing a field is permissioned and audited.
- Never put PII in logs, URLs, analytics events or live-update payloads.
- Append-only audit log of PII reveals, role changes, refunds, price changes and exports.
- Privacy law readiness: consent records, access/correction/erasure requests, retention schedule, breach runbook. Confirm current India DPDP dates and rules with counsel.

## Authentication

| Actor | Mechanism |
| --- | --- |
| Customer | Phone OTP, server-side session in Redis, `HttpOnly; Secure; SameSite=Lax` cookie |
| Staff | SSO (Microsoft Entra ID) with MFA, short sessions |
| Rider and warehouse devices | Enrolled devices, revocable per-device tokens, PIN |
| Carrier webhooks | Per-carrier signature or secret, timestamp tolerance |

OTP limits: 6 digits, 5-minute expiry, capped attempts, per-phone and per-IP limits, daily SMS budget with an alert.

## API safety

- Validate every input with shared zod schemas and reject unknown keys.
- Rate limit by IP, user and route (Redis). Put a CDN/WAF in front of the origin.
- Explicit CORS allowlist, CSRF protection on state-changing requests, strict CSP and security headers.
- Idempotency keys on order and payment creation. Webhooks deduplicated on provider and event id.
- Verify webhook signatures over the raw body with a constant-time compare.
- Tracking links use random 128-bit public ids plus signed, expiring, revocable tokens. The public page shows status and ETA only, never a phone number or full address.

## Payments

- Card data never touches our servers (hosted checkout).
- Totals computed server-side. On capture, verify amount, currency and order id.
- Payment webhook is the source of truth; the browser redirect is a hint.
- Nightly reconciliation against the provider's settlement report.
- Refunds are a workflow with approval limits; a refund cannot exceed the captured amount.
- COD risk rules: phone OTP before dispatch, value cap for new customers, serviceability and risk-pincode checks, repeat-return blocking, order velocity checks.

## Secrets (public repo)

- `.env.example` holds fake values only. Never commit real or sandbox keys.
- gitleaks runs as a pre-commit check and in CI. Enable GitHub secret scanning and push protection.
- Production secrets live in a managed store (for example Azure Key Vault) reached through a managed identity. If a secret leaks, rotate first, clean history second.

## Supply chain and CI

Committed lockfile with frozen installs, pinned CI actions, Dependabot, CodeQL, dependency and image scanning, SBOM on release. CI stages: lint and boundaries, typecheck, unit, integration (Postgres and Redis), security scans, build, end-to-end, Lighthouse budgets.

Branch protection on `main`: pull request required, all checks required, no force push, no deletion.

## Observability and backups

- Structured JSON logs with redaction tested in CI, error tracking with PII scrubbing, alerts on error rate, webhook failures, payment mismatches, OTP spend and failed backups.
- Managed Postgres point-in-time recovery plus a weekly encrypted dump to a separate account, and a monthly restore drill. Targets: RPO 15 minutes, RTO 4 hours.

## Threat model summary

| Asset | Main threat | Mitigation |
| --- | --- | --- |
| Customer PII | Database leak, injection, insider browsing | Field encryption, RLS, masking, audit |
| Accounts | OTP abuse, SMS pumping | Rate limits, SMS budget |
| Payments | Forged webhook, amount tampering | Signatures, idempotency, server totals |
| COD margin | Fake orders, returns | OTP, caps, blocklists |
| Tracking pages | Token guessing | 128-bit ids, expiry, revocation |
| Secrets | Leak through public repo | Scanning, push protection, vault |
| Supply chain | Malicious package | Lockfile, pinning, scanning |

## First 12 tasks

1. Ignore rules, `.env.example`, SECURITY.md (done).
2. Enable secret scanning, push protection, Dependabot, private vulnerability reporting.
3. gitleaks pre-commit hook and CI job (CI done).
4. Branch protection on `main`.
5. Workspace with strict TypeScript, lint and boundary rules.
6. Env schema package that fails at startup on bad config.
7. CI skeleton: install, lint, typecheck, unit, scan.
8. Cloud resources: key vault, managed Postgres, SSO app, deploy identity, CDN in front of the domain.
9. Database roles, audit table, RLS pattern with a test that proves cross-tenant reads fail.
10. Identity package: OTP sessions, staff SSO, `authorize()` with deny-by-default tests.
11. Shared middleware: validation, rate limiting, CORS, CSRF, idempotency, request ids.
12. First backup and restore drill, and the payment webhook skeleton, before any real traffic.
