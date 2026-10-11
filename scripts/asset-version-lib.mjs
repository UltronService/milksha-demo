import { readFileSync } from 'node:fs';
import { dirname, join, normalize, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {readonly string[]} */
export const HTML_ENTRY_POINTS = [
  'index.html',
  'controller/index.html',
  'receiver-demo/index.html',
];

const ASSET_REF_RE = /(?:href|src)=["']([^"']+\.(?:js|css))(?:\?v=([^"']+))?["']/gi;

export function loadAssetVersion() {
  const raw = readFileSync(join(root, 'config', 'asset-version.json'), 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed.version !== 'string' || !parsed.version.trim()) {
    throw new Error('config/asset-version.json must contain a non-empty "version" string');
  }
  return parsed.version.trim();
}

/**
 * @param {string} htmlRelPath repo-relative
 * @returns {{ href: string, repoPath: string, version: string | null }[]}
 */
export function parseHtmlAssetRefs(htmlRelPath) {
  const abs = join(root, htmlRelPath);
  const text = readFileSync(abs, 'utf8');
  const baseDir = dirname(htmlRelPath);
  /** @type {{ href: string, repoPath: string, version: string | null }[]} */
  const refs = [];
  let m;
  ASSET_REF_RE.lastIndex = 0;
  while ((m = ASSET_REF_RE.exec(text)) !== null) {
    const href = m[1];
    if (/^https?:\/\//i.test(href)) {
      continue;
    }
    const joined = posix.normalize(posix.join(baseDir.split(/[/\\]/).join('/'), href.split('?')[0]));
    const repoPath = joined.replace(/^\.\//, '');
    refs.push({ href, repoPath, version: m[2] ?? null });
  }
  return refs;
}

/**
 * Paths that require a cache-bust bump when changed (git diff guard).
 * @param {string} repoPath
 */
export function isCacheBustedAssetPath(repoPath) {
  const p = normalize(repoPath).replace(/\\/g, '/');
  if (/^js\//.test(p) || /^css\//.test(p)) {
    return true;
  }
  if (/^controller\/[^/]+\.(js|css)$/.test(p)) {
    return true;
  }
  if (p === 'config/firebase.js') {
    return true;
  }
  return false;
}

/**
 * @param {string} [mergeBaseRef]
 * @returns {string[]}
 */
export function gitChangedPathsSince(mergeBaseRef = 'origin/main') {
  const mb = spawnSync('git', ['merge-base', 'HEAD', mergeBaseRef], { cwd: root, encoding: 'utf8' });
  if (mb.status !== 0 || !mb.stdout.trim()) {
    return [];
  }
  const base = mb.stdout.trim();
  const diff = spawnSync('git', ['diff', '--name-only', `${base}..HEAD`], { cwd: root, encoding: 'utf8' });
  if (diff.status !== 0) {
    return [];
  }
  return diff.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * @param {string} [mergeBaseRef]
 */
export function assetVersionFileChangedSince(mergeBaseRef = 'origin/main') {
  const mb = spawnSync('git', ['merge-base', 'HEAD', mergeBaseRef], { cwd: root, encoding: 'utf8' });
  if (mb.status !== 0 || !mb.stdout.trim()) {
    return false;
  }
  const base = mb.stdout.trim();
  const diff = spawnSync('git', ['diff', '--name-only', `${base}..HEAD`, '--', 'config/asset-version.json'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (diff.status !== 0) {
    return false;
  }
  return diff.stdout.trim().length > 0;
}

export { root as assetVersionRoot };
