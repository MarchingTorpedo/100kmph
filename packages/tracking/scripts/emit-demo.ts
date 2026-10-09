// Writes demo/<name>.json, one TrackingView per scenario. With --check, fails
// instead of writing when a committed file is stale (run in CI).
import { readFileSync, writeFileSync } from 'node:fs';
import { buildDemoView } from '../src/demo.ts';
import { demoScenarioNames } from '../src/view-types.ts';

const check = process.argv.includes('--check');
let stale = 0;

for (const name of demoScenarioNames) {
  const target = new URL(`../demo/${name}.json`, import.meta.url);
  const json = `${JSON.stringify(buildDemoView(name), null, 2)}\n`;
  if (check) {
    let current = '';
    try {
      current = readFileSync(target, 'utf8');
    } catch {
      // Missing file counts as stale.
    }
    if (current.replace(/\r\n/g, '\n') !== json) {
      console.error(`demo/${name}.json is out of date. Run: pnpm --filter @100kmph/tracking demo:emit`);
      stale++;
    }
  } else {
    writeFileSync(target, json);
    console.log(`wrote demo/${name}.json`);
  }
}

if (check) {
  if (stale > 0) process.exit(1);
  console.log('demo/*.json are up to date');
}
