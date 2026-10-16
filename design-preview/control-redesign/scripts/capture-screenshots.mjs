import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const ARTIFACTS = '/opt/cursor/artifacts/control-ux-audit';
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

function startStaticServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url?.split('?')[0] || '/');
      let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\//, '');
      if (rel.endsWith('/')) {
        rel += 'index.html';
      }
      let filePath = join(ROOT, rel);
      if (existsSync(filePath) && statSync(filePath).isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
      if (!existsSync(filePath) || filePath.includes('..')) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = filePath.split('.').pop() || '';
      const types = {
        html: 'text/html; charset=utf-8',
        css: 'text/css',
        js: 'application/javascript',
        png: 'image/png',
        svg: 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(readFileSync(filePath));
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function captureController(page, outDir) {
  const ctrlUrl = `http://127.0.0.1:${PORT}/controller/?mode=local`;
  await page.goto(ctrlUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#online-state', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);

  const sizes = [
    { name: 'before-desktop-1280x800', width: 1280, height: 800 },
    { name: 'before-mobile-390x844', width: 390, height: 844 },
    { name: 'before-tablet-768x1024', width: 768, height: 1024 },
  ];
  for (const s of sizes) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(outDir, `${s.name}.png`), fullPage: true });
  }

  await page.locator('[data-testid="zone-toggle-connect"]').click();
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: join(outDir, 'before-desktop-1280x800-store-expanded.png'),
    fullPage: true,
  });
}

async function captureMockup(page, outDir) {
  const mockUrl = `http://127.0.0.1:${PORT}/design-preview/control-redesign/index.html`;
  await page.goto(mockUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    document.querySelector('.modal-backdrop')?.remove();
  });

  const sizes = [
    { name: 'after-desktop-1280x800', width: 1280, height: 800 },
    { name: 'after-mobile-390x844', width: 390, height: 844 },
    { name: 'after-tablet-768x1024', width: 768, height: 1024 },
  ];
  for (const s of sizes) {
    await page.setViewportSize({ width: s.width, height: s.height });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(outDir, `${s.name}.png`), fullPage: true });
  }
}

async function composeSideBySide(outDir) {
  const { chromium: pw } = await import('playwright');
  const browser = await pw.launch();
  const page = await browser.newPage({ viewport: { width: 2600, height: 900 } });
  const before = join(outDir, 'before-desktop-1280x800.png').replace(/\\/g, '/');
  const after = join(outDir, 'after-desktop-1280x800.png').replace(/\\/g, '/');
  const html = `<!DOCTYPE html><html><body style="margin:0;display:flex;gap:16px;background:#111;padding:16px">
<img src="file://${before}" width="1280" alt="before"/>
<img src="file://${after}" width="1280" alt="after"/>
</body></html>`;
  await page.setContent(html);
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(outDir, 'side-by-side-desktop-1280.png'), fullPage: false });
  await browser.close();
}

async function main() {
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = await startStaticServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const board = await ctx.newPage();
  const controller = await ctx.newPage();

  const boardUrl = `http://127.0.0.1:${PORT}/?mode=local`;
  await board.goto(boardUrl);
  await board.waitForFunction(
    () =>
      Boolean(
        window.QMS &&
          window.QMS.runtime &&
          typeof window.QMS.runtime.applyPayload === 'function',
      ),
    { timeout: 25000 },
  ).catch(() => {});

  await captureController(controller, ARTIFACTS);
  await captureMockup(controller, ARTIFACTS);
  await composeSideBySide(ARTIFACTS);

  await browser.close();
  server.close();
  console.log('Saved to', ARTIFACTS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
