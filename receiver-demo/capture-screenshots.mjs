import { chromium } from 'playwright';
import { cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ARTIFACTS = '/opt/cursor/artifacts';
const SITE_ROOT = '/tmp/milksha-site';
const SUB = 'milksha-demo';
const PORT = 8766;
const BASE = `http://127.0.0.1:${PORT}/${SUB}/receiver-demo/`;

const SAMPLE_ROWS = [
  { source_type: 'From_Store_OK', number: '1488' },
  { source_type: 'From_milksha_point_OK', number: 'P102' },
  { source_type: 'From_FoodPanda_OK', number: 'F88' },
  { source_type: 'From_Store_Preparing', number: '1985' },
  { source_type: 'From_UberEat_Preparing', number: 'U42' },
  { source_type: 'From_Udd_Preparing', number: 'D07' },
];

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

async function loadBoard(page, demo) {
  const query = demo ? '?demo=1&store=s120030' : '?store=s120030';
  await page.goto(BASE + query, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.receiverDemo && window.receiverDemo.wrapPayload);
  await page.evaluate((rows) => {
    window.receiverDemo.setOffline(false);
    window.receiverDemo.pushFromObject(window.receiverDemo.wrapPayload(rows));
  }, SAMPLE_ROWS);
  await page.waitForSelector('.rcv-ready .rcv-num');
  await page.waitForTimeout(350);
}

async function main() {
  mkdirSync(ARTIFACTS, { recursive: true });
  prepareSite();
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await loadBoard(page, false);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: join(ARTIFACTS, 'receiver-1920x1080-full.png') });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({ path: join(ARTIFACTS, 'receiver-1366x768.png') });

  await loadBoard(page, true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => {
    document.getElementById('rcv-demo-panel').classList.add('open');
  });
  await page.screenshot({ path: join(ARTIFACTS, 'receiver-demo-panel.png') });

  await page.evaluate(() => {
    const ta = document.getElementById('rcv-request-json');
    ta.value = '{ not valid json';
    document.getElementById('rcv-btn-send').click();
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(ARTIFACTS, 'receiver-format-error.png') });

  await page.evaluate(() => window.receiverDemo.clearAll());
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(ARTIFACTS, 'receiver-cleared.png') });

  await loadBoard(page, true);
  const readyBefore = await page.locator('.rcv-ready .rcv-num').filter({ hasText: /.+/ }).count();
  await page.evaluate((rows) => {
    window.receiverDemo.setOffline(true);
    window.receiverDemo.pushFromObject(
      window.receiverDemo.wrapPayload([{ source_type: 'From_Store_OK', number: '9999' }]),
    );
  }, SAMPLE_ROWS);
  const readyAfter = await page.locator('.rcv-ready .rcv-num').filter({ hasText: /.+/ }).count();
  if (readyAfter !== readyBefore) {
    throw new Error(`Offline push changed board (${readyBefore} -> ${readyAfter})`);
  }
  await page.screenshot({ path: join(ARTIFACTS, 'receiver-not-connected.png') });

  await page.evaluate(() => {
    window.receiverDemo.setOffline(false);
    const req = window.receiverDemo.wrapPayload([
      { source_type: 'From_Store_OK', number: '7777' },
    ]);
    req.serviceSpecialData_Json.target = 'milkshawrongstore';
    window.receiverDemo.pushFromObject(req);
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(ARTIFACTS, 'receiver-target-not-found.png') });

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
