import { defineConfig, devices } from '@playwright/test';

// End-to-end tests for the landing page at phone width (plus one desktop run).
// The build goes to dist-e2e so it never touches dist/ or a preview already
// running on 4321. `astro preview` takes --outDir through Astro's inline
// config (not listed in --help), and --ignore-lock lets it start alongside
// another preview server without reading or writing .astro/preview.json.
const PORT = 4330;
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // A test that only passes on retry fails the run instead of hiding.
  failOnFlakyTests: isCI,
  reporter: isCI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'Pixel 7', use: { ...devices['Pixel 7'] } },
    // iPhone viewport, UA and touch, but in Chromium (WebKit is not installed).
    { name: 'iPhone 13', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
    { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `pnpm exec astro build --outDir dist-e2e && pnpm exec astro preview --outDir dist-e2e --port ${PORT} --host 127.0.0.1 --ignore-lock`,
    url: `http://127.0.0.1:${PORT}/`,
    // Never reuse: a stale server would test an old build.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
