/** Fake-cloud only: POS HMAC verify secret for local emulator (not production). */
export const FAKE_CLOUD_POS_SIGN_SECRET =
  process.env.FAKE_CLOUD_POS_SIGN_SECRET || 'fake-milksha-pos-sign-key-for-tests';
