import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installGithubPagesSiteRoute, GITHUB_PAGES_BASE } from '../../scripts/lib/github-pages-site-route.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

let cachedPublicFirebaseJs = '';

export async function ensurePublicFirebaseJs() {
  if (cachedPublicFirebaseJs) {
    return cachedPublicFirebaseJs;
  }
  const res = await fetch(`${GITHUB_PAGES_BASE}/config/firebase.js`, { cache: 'no-store' });
  cachedPublicFirebaseJs = await res.text();
  return cachedPublicFirebaseJs;
}

/**
 * @param {import('playwright').BrowserContext} ctx
 */
export async function installLiveBranchCloudRoutes(ctx) {
  const pubJs = await ensurePublicFirebaseJs();
  await installGithubPagesSiteRoute(ctx, ROOT);
  await ctx.route('**/config/firebase.js*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: pubJs,
    });
  });
  await ctx.addInitScript(() => {
    window.__rcvMatrixTimeline = [];
    try {
      const cfg = window.MILKSHA_FIREBASE_CONFIG || {};
      localStorage.setItem(
        'milksha:cloud-settings',
        JSON.stringify({
          projectId: cfg.projectId || 'milksha-qms-dev',
          apiKey: cfg.apiKey || '',
          region: cfg.region || 'asia-east1',
        }),
      );
    } catch {
      /* ignore */
    }
  });
}

export { GITHUB_PAGES_BASE, ROOT };
