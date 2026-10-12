import { chromium } from 'playwright';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);
const { CLOUD_DELIVERY_SAMPLE_TICKETS } = require('../tests/fixtures/today-board-cloud-tickets.js');
const OUT_DIR = join(ROOT, 'artifacts', 'delivery-number');
const SITE_ROOT = '/tmp/milksha-delivery-site';
const SUB = 'milksha-demo';
const PORT = 8766;
const BASE = `http://127.0.0.1:${PORT}/${SUB}/`;

function ticketsToNumberContentForCapture(tickets) {
  const sandbox = { globalThis: {}, Date: Date, Intl: Intl };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  return sandbox.QMS.Board.TodayBoard.ticketsToNumberContent(tickets);
}

const DELIVERY_SAMPLE_CONTENT = ticketsToNumberContentForCapture(CLOUD_DELIVERY_SAMPLE_TICKETS);

function prepareSite() {
  const dest = join(SITE_ROOT, SUB);
  rmSync(SITE_ROOT, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(ROOT, dest, { recursive: true, filter: (src) => !src.includes('node_modules') });
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
          json: 'application/json',
          svg: 'image/svg+xml',
          jpg: 'image/jpeg',
        };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function loadDeliveryBoard(page) {
  await page.goto(`${BASE}?mode=local&orientation=landscape`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => window.QMS && window.QMS.MilkshaBoard && window.QMS.runtime && window.QMS.runtime.applyPayload,
  );
  await page.evaluate((rows) => {
    window.QMS.runtime.applyPayload(rows);
  }, DELIVERY_SAMPLE_CONTENT);
  await page.waitForSelector('.milksha-ready .milksha-num', { timeout: 8000 });
  await page.waitForTimeout(500);
  const text = await page.locator('.milksha-ready .milksha-num').allTextContents();
  const joined = text.join(' ');
  for (const expected of ['578', 'C7458', '6406', '7112']) {
    if (!joined.includes(expected)) {
      throw new Error(`Expected ${expected} on board, got: ${joined}`);
    }
  }
  if (joined.includes('#')) {
    throw new Error('foodpanda hash must not display: ' + joined);
  }
}

async function capture(page, width, height, filename) {
  await page.setViewportSize({ width, height });
  await loadDeliveryBoard(page);
  await page.screenshot({ path: join(OUT_DIR, filename), fullPage: false });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  prepareSite();
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await capture(page, 1920, 1080, 'board-static-1920x1080.png');
  await capture(page, 3840, 2160, 'board-static-3840x2160.png');
  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
