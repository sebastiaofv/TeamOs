const { defineConfig } = require('@playwright/test');

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
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    // Build first so the suite never runs against a stale dist/.
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: true,
    timeout: 60_000
  }
});
