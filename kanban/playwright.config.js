const { defineConfig } = require('@playwright/test');

// Not the dev server's 4173, so a running `npm run dev` is never mistaken for
// the build under test.
const PORT = 4174;

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.js',
  testIgnore: '**/unit/**',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001
    }
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    // Build first and never reuse a server, so the suite always runs against a
    // fresh dist/.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000
  }
});
