import { chromium } from 'playwright';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const PEAK_FRAME_INDEX = 8;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = '/opt/cursor/artifacts';
const SITE_ROOT = '/tmp/milksha-site';
const SUB = 'milksha-demo';
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}/${SUB}/`;

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

async function loadPeakBoardState(page, query = '') {
  const scriptPath = join(ROOT, 'demo', 'milksha-demo-script.json');
  const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
  const frame = script[PEAK_FRAME_INDEX];
  const content = frame.request.serviceSpecialData_Json.data.number_content;
  await page.goto(BASE + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.QMS && window.QMS.runtime && window.QMS.runtime.applyPayload);
  await page.evaluate((rows) => {
    window.QMS.runtime.applyPayload(rows);
  }, content);
  await page.waitForSelector('.milksha-prep .milksha-num', { timeout: 5000 });
  await page.waitForTimeout(400);
}

async function captureBoard(page, name, width, height, query = '') {
  await page.setViewportSize({ width, height });
  await loadPeakBoardState(page, query);
  const prepNums = await page.locator('.milksha-prep .milksha-num').count();
  const readyNums = await page.locator('.milksha-ready .milksha-num').count();
  if (prepNums < 1 || readyNums < 1) {
    throw new Error(`Board not populated for ${name} (ready=${readyNums}, prep=${prepNums})`);
  }
  await page.screenshot({ path: join(ARTIFACTS, name), fullPage: false });
}

async function captureDemoOverlay(page, name, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}?demo=1`, { waitUntil: 'networkidle' });
  await page.click('.milksha-demo-handle');
  await page.waitForSelector('.milksha-demo-drawer.open');
  for (let i = 0; i < 3; i += 1) {
    await page.click('#ms-demo-push');
    await page.waitForTimeout(400);
  }
  await page.waitForSelector('.milksha-ovbox.phase-in', { timeout: 8000 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(ARTIFACTS, name), fullPage: false });
}

async function main() {
  mkdirSync(ARTIFACTS, { recursive: true });
  prepareSite();
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const landscapes = [
    [1920, 1080, 'landscape-1920x1080.png'],
    [1536, 864, 'landscape-1536x864.png'],
    [1366, 768, 'landscape-1366x768.png'],
    [1280, 800, 'landscape-1280x800.png'],
  ];
  for (const [w, h, file] of landscapes) {
    await captureBoard(page, file, w, h);
  }

  await captureDemoOverlay(page, 'landscape-844x390-demo-overlay.png', 844, 390);
  await captureDemoOverlay(page, 'landscape-740x360-demo-overlay.png', 740, 360);
  await captureBoard(page, 'portrait-1080x1920.png', 1080, 1920, '?orientation=portrait');

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
