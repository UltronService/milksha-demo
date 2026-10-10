/** Real-cloud e2e store (CI must use zz-qa-ci-store; override via LIVE_CLOUD_STORE_ID). */
export const LIVE_CLOUD_STORE_ID = String(process.env.LIVE_CLOUD_STORE_ID || 'zz-qa-ci-store').trim();

export const LIVE_CLOUD_BOARD_DEVICE = String(process.env.LIVE_CLOUD_BOARD_DEVICE || 'stb-01').trim();
