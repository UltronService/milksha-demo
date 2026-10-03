/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  testDir: 'tests/e2e',
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  webServer: {
    command: 'node tests/e2e/web-server.mjs',
    url: 'http://127.0.0.1:8877/controller/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    headless: true,
  },
};
