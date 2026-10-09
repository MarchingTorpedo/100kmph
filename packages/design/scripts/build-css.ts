// Writes styles/tokens.css from src/tokens.ts. With --check, fails instead
// of writing when the committed file is stale (run in CI).
import { readFileSync, writeFileSync } from 'node:fs';
import { renderTokensCss } from '../src/css.ts';

const target = new URL('../styles/tokens.css', import.meta.url);
const css = renderTokensCss();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // Missing file counts as stale.
  }
  if (current.replace(/\r\n/g, '\n') !== css) {
    console.error('styles/tokens.css is out of date. Run: pnpm --filter @100kmph/design build:css');
    process.exit(1);
  }
  console.log('styles/tokens.css is up to date');
} else {
  writeFileSync(target, css);
  console.log('wrote styles/tokens.css');
}
