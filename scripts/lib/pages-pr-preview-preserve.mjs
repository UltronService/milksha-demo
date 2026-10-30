/**
 * Discover PR preview folders to preserve across GitHub Pages deploys.
 * Used by scripts/preserve-pages-pr-preview.mjs (unit-tested).
 */

export const MANIFEST_REL_PATH = 'pr-preview/_deployed-previews.json';

export function parseDeployedPreviewsManifest(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return [];
  }
  try {
    const data = JSON.parse(raw);
    const list = Array.isArray(data?.previews) ? data.previews : [];
    return list
      .map((n) => String(n).replace(/^pr-/, ''))
      .filter((n) => /^\d+$/.test(n));
  } catch {
    return [];
  }
}

export function buildDeployedPreviewsManifest(prNumbers) {
  const previews = [...new Set(prNumbers.map((n) => String(n).replace(/^pr-/, '')))]
    .filter((n) => /^\d+$/.test(n))
    .sort((a, b) => Number(a) - Number(b));
  return JSON.stringify({ previews }, null, 2) + '\n';
}

/** @param {string[]} headRefNamesOrNumbers from gh --jq number field */
export function mergePreservePrNumbers({
  fromManifest = [],
  fromGhCursorPrs = [],
  currentPr = '',
}) {
  const skip = currentPr ? String(currentPr).replace(/^pr-/, '') : '';
  const merged = new Set();
  for (const n of [...fromManifest, ...fromGhCursorPrs]) {
    const num = String(n).replace(/^pr-/, '');
    if (!/^\d+$/.test(num)) {
      continue;
    }
    if (skip && num === skip) {
      continue;
    }
    merged.add(num);
  }
  return [...merged].sort((a, b) => Number(a) - Number(b));
}

/**
 * @param {{ strict: boolean, inManifest: boolean, httpCode: string, mirrored: boolean, alreadyInArtifact: boolean }} ctx
 */
export function evaluatePreserveStep(ctx) {
  const { strict, inManifest, httpCode, mirrored, alreadyInArtifact } = ctx;
  if (alreadyInArtifact || mirrored) {
    return { action: 'ok' };
  }
  if (httpCode === '200') {
    return { action: 'fail', reason: 'live preview exists but was not copied into deploy artifact' };
  }
  if (strict && inManifest) {
    return {
      action: 'fail',
      reason: `manifest requires pr-${ctx.prNumber} but live HTTP ${httpCode}`,
    };
  }
  return { action: 'skip', reason: `live HTTP ${httpCode}` };
}

export function listPrNumbersFromDeploySite(prPreviewDirEntries) {
  const out = [];
  for (const name of prPreviewDirEntries) {
    const m = /^pr-(\d+)$/.exec(name);
    if (m) {
      out.push(m[1]);
    }
  }
  return out.sort((a, b) => Number(a) - Number(b));
}
