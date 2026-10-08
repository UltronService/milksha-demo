/**
 * Fulfill https://ultronservice.github.io/milksha-demo/* from a local tree (Playwright).
 * Browser origin stays github.io so CORS to Cloud Functions passes.
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export const GITHUB_PAGES_BASE = 'https://ultronservice.github.io/milksha-demo';

const REPO_PATH = '/milksha-demo';

function mimeFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
  };
  return map[ext] || 'application/octet-stream';
}

function localPathForUrl(urlString, siteRoot) {
  const url = new URL(urlString);
  if (url.origin !== 'https://ultronservice.github.io') {
    return null;
  }
  if (!url.pathname.startsWith(REPO_PATH)) {
    return null;
  }
  let rel = url.pathname.slice(REPO_PATH.length) || '/';
  if (rel.endsWith('/')) {
    rel += 'index.html';
  }
  if (!extname(rel)) {
    const asFile = join(siteRoot, rel.replace(/^\//, ''));
    if (existsSync(asFile) && statSync(asFile).isFile()) {
      return asFile;
    }
    rel = '/index.html';
  }
  const file = join(siteRoot, decodeURIComponent(rel.replace(/^\//, '')));
  return file;
}

/**
 * @param {import('playwright').BrowserContext} ctx
 * @param {string} siteRoot absolute path to branch checkout root
 */
export async function installGithubPagesSiteRoute(ctx, siteRoot) {
  const pattern = `${GITHUB_PAGES_BASE}/**`;
  await ctx.route(pattern, async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      await route.continue();
      return;
    }
    const file = localPathForUrl(req.url(), siteRoot);
    if (!file || !existsSync(file) || statSync(file).isDirectory()) {
      await route.fulfill({
        status: 404,
        contentType: 'text/plain; charset=utf-8',
        body: `github-pages-site-route: missing ${req.url()}`,
      });
      return;
    }
    const body = readFileSync(file);
    if (req.method() === 'HEAD') {
      await route.fulfill({
        status: 200,
        contentType: mimeFor(file),
        headers: { 'content-length': String(body.length) },
        body: '',
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: mimeFor(file),
      body,
    });
  });
}

export function siteRouteActive() {
  return process.env.MILKSHA_PAGES_SITE_ROUTE === '1' || Boolean(process.env.MILKSHA_SITE_ROOT);
}

export function resolveSiteRoot(defaultRoot) {
  return process.env.MILKSHA_SITE_ROOT || defaultRoot;
}
