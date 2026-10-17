#!/usr/bin/env node
/**
 * Production board @ 1920×1080: 70px font, 54px icon box, object-fit contain.
 */
import { chromium } from 'playwright';
import { cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { gotoLayoutHarness } from './check-milksha-board-column-alignment.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_PX = 70;
const ICON_BOX_FACTOR = 0.8;
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
  const siteRoot = '/tmp/milksha-official-layout-site';
  const dest = join(siteRoot, 'milksha-demo');
  rmSync(siteRoot, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(rootDir, dest, { recursive: true, filter: (src) => !src.includes('node_modules') });
  return { siteRoot, base: `http://127.0.0.1:8772/milksha-demo/` };
}

function startServer(siteRoot) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      try {
        let urlPath = req.url?.split('?')[0] || '/';
        if (urlPath.endsWith('/')) {
          urlPath += 'index.html';
        }
        const filePath = join(siteRoot, decodeURIComponent(urlPath));
        const data = readFileSync(filePath);
        const ext = filePath.split('.').pop() || '';
        const types = { html: 'text/html', css: 'text/css', js: 'text/javascript', png: 'image/png', jpg: 'image/jpeg' };
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
        res.end(data);
      } catch (_err) {
        res.writeHead(404);
        res.end('not found');
      }
    });
    server.listen(8772, '127.0.0.1', () => resolve(server));
  });
}

async function disposePlaywrightSession(browser, server) {
  if (browser) {
    try {
      await browser.close();
    } catch (_err) {
      // ignore close errors after failed launch
    }
  }
  if (server) {
    await new Promise(function (resolve) {
      server.close(function () {
        resolve(undefined);
      });
    });
  }
}

/**
 * @returns {Promise<{ ok: boolean, fontPx: number, failures: string[] }>}
 */
export async function runOfficialBoardLayoutCheck() {
  const { siteRoot, base } = prepareSite();
  const server = await startServer(siteRoot);
  let browser;
  try {
    browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await gotoLayoutHarness(page, base);
  await page.evaluate((rows) => {
    window.QMS.runtime.applyPayload(rows, { silent: true });
  }, SAMPLE_PAYLOAD);
  await page.waitForSelector('.milksha-board-icon--fp');
  await page.waitForFunction(() => {
    const imgs = document.querySelectorAll('.milksha-board-icon');
    for (const img of imgs) {
      if (!img.complete || img.naturalWidth === 0) {
        return false;
      }
    }
    return imgs.length >= 3;
  });

  const result = await page.evaluate(function (expectedFont) {
    const failures = [];
    const root = document.querySelector('.milksha-stage');
    const fontVar = root ? getComputedStyle(root).getPropertyValue('--milksha-num-font').trim() : '';
    if (fontVar !== expectedFont + 'px') {
      failures.push('--milksha-num-font expected ' + expectedFont + 'px got ' + fontVar);
    }
    document.querySelectorAll('.milksha-num').forEach(function (el) {
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (Math.abs(fs - expectedFont) > 0.5) {
        failures.push('font-size ' + fs + ' on ' + el.textContent);
      }
      const fam = cs.fontFamily || '';
      if (!/^Arial/.test(fam) && !fam.includes('Arial')) {
        failures.push('font-family must lead with Arial on ' + el.textContent + ' got ' + fam);
      }
      if (cs.fontWeight !== '400' && cs.fontWeight !== 'normal') {
        failures.push('font-weight ' + cs.fontWeight + ' on ' + el.textContent);
      }
    });
    document.querySelectorAll('.milksha-board-icon-box').forEach(function (box) {
      const w = box.getBoundingClientRect().width;
      if (Math.abs(w - 54) > 1.5) {
        failures.push('icon box width ' + w + ' expected 54px');
      }
    });
    document.querySelectorAll('.milksha-board-icon').forEach(function (img) {
      const cs = getComputedStyle(img);
      if (cs.objectFit !== 'contain') {
        failures.push('object-fit ' + cs.objectFit + ' on icon');
      }
      const box = img.closest('.milksha-board-icon-box');
      const slot = img.closest('.milksha-board-icon-slot');
      if (box && getComputedStyle(box).overflow === 'hidden') {
        failures.push('icon box overflow hidden');
      }
      if (slot && getComputedStyle(slot).overflow === 'hidden') {
        failures.push('icon slot overflow hidden');
      }
    });
    const fp = document.querySelector('.milksha-board-chip[data-item-id="fp:#6405"] .milksha-num');
    if (!fp || fp.textContent !== '#6405') {
      failures.push('foodpanda display expected #6405 got ' + (fp ? fp.textContent : 'missing'));
    }
    return { ok: failures.length === 0, fontPx: expectedFont, failures: failures };
  }, FONT_PX);

  return result;
  } finally {
    await disposePlaywrightSession(browser, server);
  }
}
