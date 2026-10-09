#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-ready-fade-self-qa', 'contact-sheets');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

function buildContactSheet(framesDir, outPath) {
  const py = `
import glob, sys
from PIL import Image
paths = sorted(glob.glob(sys.argv[1] + '/f-*.jpg'))[:24]
im0 = Image.open(paths[0]).convert('RGB')
w, h = im0.size
cols = 6
rows = (len(paths) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols, h * rows), (245, 245, 245))
for i, p in enumerate(paths):
    img = Image.open(p).convert('RGB')
    r, c = divmod(i, cols)
    sheet.paste(img.resize((w, h)), (c * w, r * h))
sheet.save(sys.argv[2], quality=82, optimize=True)
`;
  const pyPath = join(framesDir, '_sheet.py');
  writeFileSync(pyPath, py);
  execSync(`python3 "${pyPath}" "${framesDir}" "${outPath}"`, { stdio: 'inherit' });
  for (const name of readdirSync(framesDir)) {
    if (name.startsWith('f-') && name.endsWith('.jpg')) {
      unlinkSync(join(framesDir, name));
    }
  }
}

async function captureReadyFade(page, burstDir) {
  mkdirSync(burstDir, { recursive: true });
  await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
  const frames = [];
  const shot = async () => {
    const p = join(burstDir, `f-${String(frames.length).padStart(3, '0')}.jpg`);
    await page.screenshot({ path: p, type: 'jpeg', quality: 72 });
    frames.push(p);
  };
  await shot();
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '9101' }]);
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([
      { source_type: 'From_Store_Preparing', number: '9101' },
      { source_type: 'From_Store_OK', number: '9101' },
    ]);
  });
  const end = Date.now() + 900;
  while (Date.now() < end) {
    await page.waitForTimeout(40);
    await shot();
  }
}

async function main() {
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of [{ width: 1920, height: 1080, tag: '1920x1080' }, { width: 3840, height: 2160, tag: '3840x2160' }]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const burstDir = join(ART, 'burst', vp.tag);
    await captureReadyFade(page, burstDir);
    const out = join(ART, `${vp.tag}-ready-fade-in.jpg`);
    buildContactSheet(burstDir, out);
    await ctx.close();
    console.log('wrote', out);
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
