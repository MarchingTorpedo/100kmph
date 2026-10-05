# Launch checklist

What a small Indian D2C clothing brand needs beyond the core platform. Facts marked *(unverified)* were not confirmed against primary sources.

## Verified (secondary sources)

- GST on garments: 5% up to Rs 2,500 per piece and 18% above, from 22 Sep 2025. Confirm with a CA whether the threshold uses the pre- or post-discount price.
- E-invoicing applies above Rs 5 crore annual turnover and is mainly B2B. Bulk and custom orders to GST-registered businesses will need it once crossed. Check the GST portal.

## Must before launch

1. Redirect map and sitemap from the current shop's URLs, so search rankings survive the move.
2. Data migration from the shop export: products, variants, customers (passwordless login, no password hashes), order history with continued order numbers, consent flags. Rehearse twice on staging.
3. GST invoice engine: gap-free series, HSN, rate per line, CGST/SGST or IGST by place of supply, credit notes.
4. Legal pages: terms, privacy, refund and cancellation, shipping, contact, grievance officer. Payment providers' KYC needs them.
5. Size guides and fit notes per product.
6. Pincode serviceability, address validation, COD availability and ETA on the product page.
7. COD confirmation and return-to-origin reduction (buy before building).
8. Transactional messaging by email and WhatsApp. WhatsApp templates need approval, so start early.
9. Failed-delivery (NDR) handling through the shipping aggregator.
10. Consent and cookie banner, deletion and correction requests, no ad pixels before consent.
11. Analytics and ad conversion tracking with deduplicated server-side events, and product feeds for Google and Meta.
12. Structured data (JSON-LD), titles and meta tags. Landing animation must not hurt LCP or CLS.
13. Inventory by size and colour, with stock reservation at checkout.
14. Error monitoring, uptime check, backups with a tested restore, staging environment, payment reconciliation.
15. Admin audit trail.
16. Basic discount engine, including importing active codes.
17. Simple helpdesk flow (contact form and WhatsApp link).
18. Accessibility baseline, including reduced-motion support.

## First three months

Abandoned-cart messages, reviews with photos, returns and exchange portal, search, wishlist with back-in-stock alerts, drops and preorders (scheduled publish, stock caps, waitlist), bulk and custom-print enquiries, campaigns, referral codes, image pipeline and web-vitals tuning, product feed health.

## Later

Loyalty tiers, fit quiz, extra languages, marketplace sync, customer-facing live map, fine-grained roles, A/B testing, gift cards, native app wrappers.

## Scope warnings

- Live map with handler phone numbers: carriers rarely expose rider GPS. Launch with a status timeline and show a masked call button only near delivery.
- Use polling every 15 to 30 seconds on tracking pages first; use live push only on the ops board.
- Use one shipping aggregator and one payment gateway behind an interface.
- Keep motion on the landing and drop pages. Elsewhere it competes with speed and search ranking.
- A single region, managed Postgres and a CDN will carry the brand a long way. Skip Kubernetes and microservices.
