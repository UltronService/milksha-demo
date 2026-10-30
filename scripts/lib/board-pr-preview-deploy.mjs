/**
 * GitHub Pages board PR preview deploy helpers (unit-tested).
 */

export const GITHUB_PAGES_BASE = 'https://ultronservice.github.io/milksha-demo';

/**
 * @param {number | string} prNumber
 * @param {string} [pagesBase]
 */
export function buildPreviewBaseUrl(prNumber, pagesBase = GITHUB_PAGES_BASE) {
  const n = String(prNumber).replace(/^pr-/, '').trim();
  if (!/^\d+$/.test(n)) {
    throw new Error(`invalid preview PR number: ${prNumber}`);
  }
  const base = pagesBase.replace(/\/$/, '');
  return `${base}/pr-preview/pr-${n}/`;
}

/**
 * @param {{
 *   associatedPrNumbers?: (string | number)[];
 *   headLookupNumber?: string | number;
 *   dispatchInput?: string;
 * }} opts
 * @returns {string | null}
 */
export function resolvePreviewPrNumber(opts) {
  const dispatch = String(opts.dispatchInput ?? '').trim();
  if (/^\d+$/.test(dispatch)) {
    return dispatch;
  }
  for (const raw of opts.associatedPrNumbers ?? []) {
    const n = String(raw).trim();
    if (/^\d+$/.test(n)) {
      return n;
    }
  }
  const head = String(opts.headLookupNumber ?? '').trim();
  if (/^\d+$/.test(head)) {
    return head;
  }
  return null;
}

/**
 * @param {string} source
 */
export function parseMilkshaAssetVersionJs(source) {
  const versionMatch = source.match(/MILKSHA_ASSET_VERSION\s*=\s*'([^']+)'/);
  const labelMatch = source.match(/MILKSHA_BOARD_WEB_BUILD_LABEL\s*=\s*'([^']+)'/);
  return {
    version: versionMatch?.[1] ?? null,
    boardWebBuildLabel: labelMatch?.[1] ?? null,
  };
}

/**
 * @param {{ assetVersionJsonText: string; milkshaAssetVersionJsText: string }} files
 */
export function loadExpectedPreviewAssetStamp(files) {
  const config = JSON.parse(files.assetVersionJsonText);
  const expectedVersion =
    typeof config?.version === 'string' ? config.version.trim() : '';
  if (!expectedVersion) {
    throw new Error('config/asset-version.json must contain a non-empty "version" string');
  }
  const fromJs = parseMilkshaAssetVersionJs(files.milkshaAssetVersionJsText);
  if (fromJs.version !== expectedVersion) {
    throw new Error(
      `js/milksha-asset-version.js (${fromJs.version}) must match config (${expectedVersion})`,
    );
  }
  return {
    expectedVersion,
    expectedBuildLabel: fromJs.boardWebBuildLabel,
  };
}

/**
 * @param {string} liveJsText
 * @param {{ expectedVersion: string; expectedBuildLabel: string | null }} expected
 */
export function assertLivePreviewMatchesExpected(liveJsText, expected) {
  const live = parseMilkshaAssetVersionJs(liveJsText);
  /** @type {string[]} */
  const errors = [];
  if (live.version !== expected.expectedVersion) {
    errors.push(
      `live MILKSHA_ASSET_VERSION ${live.version ?? '(missing)'} !== expected ${expected.expectedVersion}`,
    );
  }
  if (expected.expectedBuildLabel && live.boardWebBuildLabel !== expected.expectedBuildLabel) {
    errors.push(
      `live MILKSHA_BOARD_WEB_BUILD_LABEL ${live.boardWebBuildLabel ?? '(missing)'} !== expected ${expected.expectedBuildLabel}`,
    );
  }
  return { ok: errors.length === 0, errors, live };
}
