import { chromium } from 'playwright';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'artifacts', 'controller-source');
mkdirSync(outDir, { recursive: true });

const ctrlUrl = 'file://' + join(root, 'controller', 'index.html') + '?mode=local';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(ctrlUrl, { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('[data-testid="fld-quick-source"]', { timeout: 15000 });
await page.selectOption('[data-testid="fld-quick-source"]', 'uber');
await page.fill('[data-testid="fld-quick-no"]', 'C7458');
await page.screenshot({
  path: join(outDir, 'controller-1920-quick-source.png'),
  fullPage: false,
});
await browser.close();
console.log('saved', join(outDir, 'controller-1920-quick-source.png'));
