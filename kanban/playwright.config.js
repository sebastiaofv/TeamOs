const { defineConfig } = require('@playwright/test');

const webServerCommand = process.platform === 'win32'
  ? 'py -3 -m http.server 4173 --bind 127.0.0.1'
  : 'python3 -m http.server 4173 --bind 127.0.0.1';

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.js',
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: webServerCommand,
    port: 4173,
    reuseExistingServer: true,
    timeout: 30_000
  }
});
