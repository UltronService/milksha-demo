// @ts-check
const e2ePort = process.env.MILKSHA_E2E_PORT || '8877';
/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: 'tests/e2e',
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  webServer: {
    command: 'node tests/e2e/web-server.mjs',
    url: `http://127.0.0.1:${e2ePort}/controller/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      MILKSHA_E2E_PORT: e2ePort,
      FAKE_CLOUD_HTTP_DATE: 'Sat, 03 Oct 2026 12:00:00 GMT',
    },
  },
  use: {
    headless: true,
  },
};
