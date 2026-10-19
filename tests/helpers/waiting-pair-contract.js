'use strict';

/** Shared contract for「等待配對中」TDD red phase (green implements these). */

const WAITING_PAIR_MODULE = 'js/board/board-waiting-pair.js';
const WAITING_PAIR_HOST_MODULE = 'js/board/board-waiting-pair-host.js';
const URL_BIND_MODULE = 'js/receiver/board-url-bind-sync.js';

const QA_WAITING_STORE = 's999998';
const QA_AUTO_REGISTER_STORE = 'zz-qa-pair-01';

const WAITING_OVERLAY_TEST_ID = 'board-waiting-pair';
const SETUP_GATE_TEST_ID = 'board-store-setup';

const PAIR_RETRY_MIN_MS = 10_000;
const PAIR_SUCCESS_DEADLINE_MS = 15_000;

/** Full-width ideographic space between store id and status text. */
const WAITING_IDEO_SPACE = '\u3000';

/**
 * @param {string} displayStoreId trimmed URL store (case preserved)
 * @returns {string}
 */
function formatWaitingPairLine(displayStoreId) {
  return `店編號 ${displayStoreId}${WAITING_IDEO_SPACE}等待配對中`;
}

/**
 * Expected cloud JSON when store format is valid but store not provisioned yet.
 * @type {{ ok: false, code: 'waiting_pair' }}
 */
const CLOUD_WAITING_PAIR_BODY = Object.freeze({
  ok: false,
  code: 'waiting_pair',
  information: '等待配對',
});

/**
 * Expected cloud JSON when cloud rejects store number format.
 * @type {{ ok: false, code: 'invalid_store_format' }}
 */
const CLOUD_INVALID_STORE_FORMAT_BODY = Object.freeze({
  ok: false,
  code: 'invalid_store_format',
  information: '店號格式不對',
});

module.exports = {
  WAITING_PAIR_MODULE,
  WAITING_PAIR_HOST_MODULE,
  URL_BIND_MODULE,
  QA_WAITING_STORE,
  QA_AUTO_REGISTER_STORE,
  WAITING_OVERLAY_TEST_ID,
  SETUP_GATE_TEST_ID,
  PAIR_RETRY_MIN_MS,
  PAIR_SUCCESS_DEADLINE_MS,
  formatWaitingPairLine,
  CLOUD_WAITING_PAIR_BODY,
  CLOUD_INVALID_STORE_FORMAT_BODY,
};
