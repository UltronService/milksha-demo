import { chromium } from 'playwright';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'artifacts', 'controller-debug-triage', 'board-source-measurements-1920x1080.json');
const SITE_ROOT = '/tmp/milksha-measure-site';
const SUB = 'milksha-demo';
const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}/${SUB}/`;

const SAMPLE = [
  { no: '1234', status: 'ready', sourceKey: 'store' },
  { no: '091', status: 'ready', sourceKey: 'point' },
  { no: '#6405', status: 'ready', sourceKey: 'fp' },
  { no: 'A1B2C', status: 'ready', sourceKey: 'uber' },
  { no: '5678', status: 'ready', sourceKey: 'udd' },
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
        res.writeHead(200);
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('');
      }
    });
    server.listen(PORT, () => resolve(server));
  });
}

function ticketsToPayload(tickets) {
  const sandbox = { globalThis: {}, Date: Date, Intl: Intl };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(readFileSync(join(ROOT, 'js', 'receiver', 'validate-request.js'), 'utf8'), sandbox);
  const Validate = sandbox.QMS.Receiver.Validate;
  const TodayBoard = sandbox.QMS.Board.TodayBoard;
  const rows = tickets.map(function (t) {
    const def = { store: 'From_Store_OK', point: 'From_milksha_point_OK', fp: 'From_FoodPanda_OK', uber: 'From_UberEat_OK', udd: 'From_Udd_OK' };
    return { number: t.no, source_type: def[t.sourceKey] || def.store };
  });
  return rows;
}

async function main() {
  prepareSite();
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(BASE + '?demo=0', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.QMS && window.QMS.runtime));
  await page.evaluate((rows) => window.QMS.runtime.applyPayload(rows, { silent: true }), ticketsToPayload(SAMPLE));
  await page.waitForSelector('.milksha-board-chip[data-item-id]');

  const measurements = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('.milksha-board-chip[data-item-id]').forEach((chip) => {
      const id = chip.getAttribute('data-item-id') || '';
      const sourceKey = id.split(':')[0];
      const num = chip.querySelector('.milksha-num');
      const icon = chip.querySelector('.milksha-board-icon');
      const iconBox = chip.querySelector('.milksha-board-icon-box');
      const numStyle = num ? getComputedStyle(num) : null;
      const gapPx = num && iconBox ? Math.round(iconBox.getBoundingClientRect().left - num.getBoundingClientRect().right) : null;
      out[sourceKey] = {
        itemId: id,
        fontFamily: numStyle ? numStyle.fontFamily : '',
        fontWeight: numStyle ? numStyle.fontWeight : '',
        fontSizePx: numStyle ? parseFloat(numStyle.fontSize) : null,
        iconWidthPx: icon ? Math.round(icon.getBoundingClientRect().width) : null,
        iconHeightPx: icon ? Math.round(icon.getBoundingClientRect().height) : null,
        iconBoxWidthPx: iconBox ? Math.round(iconBox.getBoundingClientRect().width) : null,
        gapNumberToIconPx: gapPx,
      };
    });
    return out;
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ viewport: '1920x1080', measurements }, null, 2));
  await browser.close();
  await new Promise((r) => server.close(r));
  console.log(JSON.stringify(measurements, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
