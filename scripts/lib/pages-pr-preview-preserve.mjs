/**
 * Discover PR preview folders to preserve across GitHub Pages deploys.
 * Used by scripts/preserve-pages-pr-preview.mjs (unit-tested).
 */
import { join } from 'node:path';
import { verifyPreviewFolderIntegrity } from './pages-pr-preview-mirror.mjs';

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
 * @param {{ strict: boolean, inManifest: boolean, httpCode: string, mirrored: boolean, alreadyInArtifact: boolean, integrityOk?: boolean }} ctx
 */
export function evaluatePreserveStep(ctx) {
  const { strict, inManifest, httpCode, mirrored, alreadyInArtifact, integrityOk = true } = ctx;
  if (alreadyInArtifact || mirrored) {
    if (strict && !integrityOk) {
      return {
        action: 'fail',
        reason: 'preview folder failed asset integrity check (index-referenced js/css missing or nested mirror path)',
      };
    }
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

/**
 * Strict deploy: every listed pr-* folder must have index + HTML-referenced assets at dest root.
 * @param {string} deploySite
 * @param {string} rootUrl Pages site root (e.g. https://host/repo)
 * @param {string[]} prNumbers
 */
export function verifyStrictPreviewFolders(deploySite, rootUrl, prNumbers) {
  const errors = [];
  for (const num of prNumbers) {
    const destDir = join(deploySite, 'pr-preview', `pr-${num}`);
    const check = verifyPreviewFolderIntegrity(destDir, rootUrl);
    if (!check.ok) {
      if (check.misplacedNested) {
        errors.push(`pr-${num}: nested mirror path under repo/pr-preview (assets not at folder root)`);
      }
      for (const rel of check.missing) {
        errors.push(`pr-${num}: missing ${rel}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
