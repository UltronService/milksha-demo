/** @type {import('@playwright/test').PlaywrightTestConfig} */
export default {
  testDir: 'tests/e2e',
  timeout: 60000,
  use: {
    headless: true,
  },
};
