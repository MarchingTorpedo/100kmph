# Security policy

This repository is public. Anyone can read the code, so security never relies on the code being secret.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting (Security tab, "Report a vulnerability"). Please do not open a public issue for a security problem.

## Rules for contributors

- Never commit secrets, customer data, database dumps, exports from the old shop, or real API keys, including test or sandbox keys.
- Real values live in local `.env` files (ignored by git) and, in production, in a managed secret store.
- If a secret is ever pushed, treat it as leaked: **rotate it first**, then clean history. Deleting the commit is not enough.
- Customer personal data (names, phones, addresses) must never appear in logs, URLs, analytics events or test fixtures.

## Baseline controls

- Secret scanning: gitleaks runs in CI on every push and pull request. Turn on GitHub secret scanning and push protection in repository settings.
- Dependencies: Dependabot opens weekly update pull requests.
- Details of the target design (authentication, payments, encryption, backups, threat model) are in [docs/security.md](docs/security.md).
