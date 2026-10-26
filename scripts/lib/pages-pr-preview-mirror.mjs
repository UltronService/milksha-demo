/**
 * Mirror live pr-preview/pr-N/ trees into a deploy-site folder (unit/integration tested).
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';

export function previewFolderUrl(rootUrl, prNumber) {
  const base = String(rootUrl).replace(/\/$/, '');
  return `${base}/pr-preview/pr-${prNumber}/`;
}

/** Path segments in URL before preview files (e.g. /repo/pr-preview/pr-N/ → 3). */
export function wgetCutDirsForPreviewUrl(rootUrl, prNumber) {
  const pathname = new URL(previewFolderUrl(rootUrl, prNumber)).pathname.replace(/\/$/, '');
  return pathname.split('/').filter(Boolean).length;
}

function runWgetMirror(destDir, url, cutDirs) {
  const args = ['-q', '-e', 'robots=off', '-r', '-np', '-nH', '-l', '30'];
  if (cutDirs > 0) {
    args.push(`--cut-dirs=${cutDirs}`);
  }
  args.push(url);
  return spawnSync('wget', args, { cwd: destDir, encoding: 'utf8' });
}

function repoSegmentFromRootUrl(rootUrl) {
  const pathname = new URL(String(rootUrl).replace(/\/$/, '') + '/').pathname.replace(/\/$/, '');
  const segments = pathname.split('/').filter(Boolean);
  return segments.length ? segments[segments.length - 1] : '';
}

/** Move wget output from repo/pr-preview/pr-N/* into destDir when cut-dirs was insufficient. */
export function flattenMisplacedPreviewTree(destDir, rootUrl, prNumber) {
  const repoSegment = repoSegmentFromRootUrl(rootUrl);
  if (!repoSegment) {
    return;
  }
  const nestedRoot = join(destDir, repoSegment, 'pr-preview', `pr-${prNumber}`);
  if (!existsSync(nestedRoot)) {
    return;
  }
  for (const name of readdirSync(nestedRoot)) {
    renameSync(join(nestedRoot, name), join(destDir, name));
  }
  removeEmptyDirsUp(join(destDir, repoSegment));
}

function removeEmptyDirsUp(dir) {
  if (!existsSync(dir)) {
    return;
  }
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      removeEmptyDirsUp(p);
    }
  }
  if (existsSync(dir) && readdirSync(dir).length === 0) {
    rmdirSync(dir);
  }
}

/** Rename on-disk files like app.js?v=1 → app.js (wget default with query URLs). */
export function stripQueryStringFromSavedFilenames(rootDir) {
  walkFiles(rootDir, (filePath) => {
    const base = filePath.split('/').pop() ?? '';
    if (!base.includes('?')) {
      return;
    }
    const cleanBase = base.split('?')[0];
    if (!cleanBase) {
      return;
    }
    renameSync(filePath, join(dirname(filePath), cleanBase));
  });
}

function walkFiles(dir, onFile) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walkFiles(p, onFile);
    } else {
      onFile(p);
    }
  }
}

export function hasMisplacedNestedPreviewTree(destDir, rootUrl) {
  const repoSegment = repoSegmentFromRootUrl(rootUrl);
  if (!repoSegment) {
    return false;
  }
  return existsSync(join(destDir, repoSegment, 'pr-preview'));
}

const ASSET_ATTR_RE =
  /<(?:script[^>]+src|link[^>]+href)\s*=\s*["']([^"']+)["']/gi;

/** Relative script/link paths referenced from index.html (query/hash stripped). */
export function collectRelativeAssetPathsFromHtml(html) {
  const paths = new Set();
  let m;
  ASSET_ATTR_RE.lastIndex = 0;
  while ((m = ASSET_ATTR_RE.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw || raw.startsWith('http:') || raw.startsWith('https:') || raw.startsWith('//')) {
      continue;
    }
    const noHash = raw.split('#')[0];
    const noQuery = noHash.split('?')[0];
    if (noQuery.startsWith('/')) {
      continue;
    }
    paths.add(noQuery);
  }
  return [...paths];
}

/**
 * @returns {{ ok: boolean, missing: string[], misplacedNested: boolean }}
 */
export function verifyPreviewFolderIntegrity(destDir, rootUrl) {
  const missing = [];
  const misplacedNested = hasMisplacedNestedPreviewTree(destDir, rootUrl);
  const indexPath = join(destDir, 'index.html');
  if (!existsSync(indexPath)) {
    return { ok: false, missing: ['index.html'], misplacedNested };
  }
  const html = readFileSync(indexPath, 'utf8');
  for (const rel of collectRelativeAssetPathsFromHtml(html)) {
    if (!existsSync(join(destDir, rel))) {
      missing.push(rel);
    }
  }
  return { ok: missing.length === 0 && !misplacedNested, missing, misplacedNested };
}

/**
 * Mirror one preview folder from a live Pages URL into destDir (CI wget flags + cut-dirs).
 * @returns {boolean} true only when wget succeeds and destDir has a complete preview tree.
 */
export function mirrorPreviewTree(destDir, rootUrl, prNumber) {
  mkdirSync(destDir, { recursive: true });
  const url = previewFolderUrl(rootUrl, prNumber);
  const cutDirs = wgetCutDirsForPreviewUrl(rootUrl, prNumber);
  const wget = runWgetMirror(destDir, url, cutDirs);
  if (wget.status !== 0) {
    return false;
  }
  flattenMisplacedPreviewTree(destDir, rootUrl, prNumber);
  stripQueryStringFromSavedFilenames(destDir);
  return verifyPreviewFolderIntegrity(destDir, rootUrl).ok;
}
