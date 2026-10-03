/** Fake-cloud only: POS HMAC verify secret for local emulator (not production). */
export const FAKE_CLOUD_POS_SIGN_SECRET =
  process.env.FAKE_CLOUD_POS_SIGN_SECRET || 'dev-milksha-public-test-key-2026';
