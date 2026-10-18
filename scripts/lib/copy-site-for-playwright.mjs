import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * @param {string} src
 * @returns {boolean}
 */
export function shouldSkipSiteCopyPath(src) {
  const normalized = src.replace(/\\/g, '/');
  if (normalized.includes('node_modules')) {
    return true;
  }
  if (normalized.includes('/.git/') || normalized.endsWith('/.git')) {
    return true;
  }
  return false;
}

/**
 * @param {string} rootDir
 * @returns {{ siteRoot: string, dest: string }}
 */
export function copySiteForPlaywright(rootDir) {
  const siteRoot = join(tmpdir(), `milksha-site-${process.pid}-${randomUUID()}`);
  const dest = join(siteRoot, 'milksha-demo');
  mkdirSync(dest, { recursive: true });
  cpSync(rootDir, dest, {
    recursive: true,
    filter: (src) => !shouldSkipSiteCopyPath(src),
  });
  return { siteRoot, dest };
}

/**
 * @param {string} siteRoot
 */
export async function removeSiteCopy(siteRoot) {
  rmSync(siteRoot, { recursive: true, force: true });
}
