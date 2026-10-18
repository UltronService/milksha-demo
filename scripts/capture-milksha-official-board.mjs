#!/usr/bin/env node
/**
 * Full-board 1920×1080 screenshot with official sample numbers (no demo overlay).
 */
import { chromium } from 'playwright';
import { cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'artifacts', 'milksha-official-board');
const SITE_ROOT = '/tmp/milksha-official-board-site';
const SUB = 'milksha-demo';
const PORT = 8771;
const BASE = `http://127.0.0.1:${PORT}/${SUB}/`;

const SAMPLE_PAYLOAD = [
  { source_type: 'From_Store_Preparing', number: '2217' },
  { source_type: 'From_milksha_point_Preparing', number: '096' },
  { source_type: 'From_FoodPanda_Preparing', number: '#6405' },
  { source_type: 'From_UberEat_Preparing', number: 'BFBEF' },
  { source_type: 'From_Store_OK', number: '2217' },
  { source_type: 'From_milksha_point_OK', number: '096' },
  { source_type: 'From_FoodPanda_OK', number: '#6405' },
  { source_type: 'From_UberEat_OK', number: 'BFBEF' },
];

function prepareSite() {
  const dest = join(SITE_ROOT, SUB);
  rmSync(SITE_ROOT, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => !src.includes('node_modules'),
  });
}

function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      try {
        let urlPath = req.url?.split('?')[0] || '/';
        if (urlPath.endsWith('/')) {
          urlPath += 'index.html';
        }
        const filePath = join(SITE_ROOT, decodeURIComponent(urlPath));
        const data = readFileSync(filePath);
        const ext = filePath.split('.').pop() || '';
        const types = {
          html: 'text/html',
          css: 'text/css',
          js: 'text/javascript',
          png: 'image/png',
          jpg: 'image/jpeg',
          svg: 'image/svg+xml',
        };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(data);
      } catch (_err) {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  prepareSite();
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(BASE + '?demo=0', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.QMS && window.QMS.runtime && window.QMS.runtime.applyPayload);
  await page.evaluate((rows) => {
    window.QMS.runtime.applyPayload(rows, { silent: true });
  }, SAMPLE_PAYLOAD);
  await page.waitForSelector('.milksha-board-icon--fp', { timeout: 15000 });
  await page.waitForFunction(() => {
    const imgs = document.querySelectorAll('.milksha-board-icon');
    for (const img of imgs) {
      if (!img.complete || img.naturalWidth === 0) {
        return false;
      }
    }
    return imgs.length >= 3;
  });
  await page.waitForTimeout(400);
  const outPath = join(OUT_DIR, 'milksha-official-board-1920x1080.png');
  await page.screenshot({ path: outPath, fullPage: false });
  await browser.close();
  await new Promise((r) => server.close(r));
  console.log(outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
