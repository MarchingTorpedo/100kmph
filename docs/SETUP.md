# Setup guide (Windows 10, VS Code)

You do not need Docker or a database for the first phase (landing page and design system). Add them later when the backend starts.

## 1. Tools

| Tool | Version | How |
| --- | --- | --- |
| Git for Windows | latest | git-scm.com. A portable zip also works if installers are blocked. |
| Node.js | 22 LTS | nodejs.org installer, or nvm-windows. The zip build works without an installer. |
| pnpm | 10 | `npm install -g pnpm@10` |
| VS Code | latest | code.visualstudio.com. A zip build works too. |
| gitleaks | 8.x | github.com/gitleaks/gitleaks releases (a single .exe) |

VS Code extensions: ESLint, Prettier, EditorConfig, GitHub Pull Requests.

## 2. Get the code

```bash
git clone https://github.com/MarchingTorpedo/100kmph.git
cd 100kmph
node -v    # should print v22.x
pnpm -v    # should print 10.x
```

## 3. Daily routine

```bash
git pull
# ... work ...
pnpm scan:secrets        # before committing
git add -A
git commit -m "feat: short description"
git push
```

Use small commits with clear messages (`feat:`, `fix:`, `docs:`, `chore:`). A steady commit history reads well on a public profile.

## 4. Rules

- Never commit `.env`, exports from the old shop, or customer data (see SECURITY.md).
- Copy `.env.example` to `.env` and fill it in locally.
- Run the secret scan before every push.

## 5. Turn on in GitHub (once)

Settings, Code security: enable secret scanning, push protection, Dependabot alerts and private vulnerability reporting. Settings, Rules: protect `main` (require pull request and passing checks, block force pushes).

## 6. Snapshot the current shop (products, images, URLs)

The client's catalogue is public on 100kmph.com. Run this on your own laptop (it needs normal internet access):

```bash
pnpm snapshot:site
```

It saves products, variants, collections, the sitemap URL list (for redirects), page HTML and images into `data-private/snapshot/`, which git ignores. It is slow on purpose (about 2 requests per second).

Rules for the snapshot:
- Never commit it. The images and copy belong to the client, and the repo is public. Keep a private backup (for example a private cloud folder).
- It covers public catalogue data only. It does not include customers, orders or discount codes; those need the client's Shopify export.
- Check `manifest.json` afterwards: every saved file lists its source URL and checksum.

After the snapshot, find the photos that are too small or too few:

```bash
pnpm audit:images
```

It lists products with fewer than 3 images or only small ones (long side under 1200 px, adjustable with `MIN_LONG_SIDE`). Photos you still have to save by hand (for example banners the feed does not include) go in `data-private/snapshot/images/manual/`. Keep the file name as `<product-handle>-<n>.jpg` where it belongs to a product.

Until the client supplies customer, order and discount data, the demo runs on synthetic data only. Never put real customer data in the repo, fixtures or screenshots.
