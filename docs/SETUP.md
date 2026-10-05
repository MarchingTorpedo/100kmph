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
