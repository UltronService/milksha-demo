#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-animation-self-qa', 'contact-sheets');
const PORT = Number(process.env.MILKSHA_E2E_PORT || 8877);

const SCENARIOS = [
  {
    id: '1-new-prep',
    run: async (page) => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '8101' }]);
      });
    },
    ms: 800,
  },
  {
    id: '2-call-ready',
    run: async (page) => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_Preparing', number: '8102' }]);
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '8102' },
          { source_type: 'From_Store_OK', number: '8102' },
        ]);
      });
    },
    ms: 3800,
  },
  {
    id: '3-pickup',
    run: async (page) => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_OK', number: '8103' },
          { source_type: 'From_Store_OK', number: '8104' },
        ]);
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([{ source_type: 'From_Store_OK', number: '8104' }]);
      });
    },
    ms: 800,
  },
  {
    id: '4-page-turn',
    run: async (page) => {
      const batch = [];
      for (let i = 1; i <= 11; i += 1) {
        batch.push({ source_type: 'From_Store_Preparing', number: String(8200 + i) });
      }
      await page.evaluate((p) => window.QMS.runtime.applyPayload(p), batch);
      await page.waitForTimeout(300);
      await page.evaluate(() => window.QMS.runtime.advanceZonePageForTest('prep'));
    },
    ms: 900,
  },
  {
    id: '5-clear',
    run: async (page) => {
      await page.evaluate(() => {
        window.QMS.runtime.applyPayload([
          { source_type: 'From_Store_Preparing', number: '8301' },
          { source_type: 'From_Store_OK', number: '8302' },
        ]);
      });
      await page.waitForTimeout(200);
      await page.evaluate(() => window.QMS.runtime.applyPayload([]));
    },
    ms: 800,
  },
  {
    id: '6-rapid-5',
    run: async (page) => {
      for (let i = 0; i < 5; i += 1) {
        await page.evaluate((n) => {
          window.QMS.runtime.applyPayload([
            { source_type: 'From_Store_Preparing', number: String(8400 + n) },
            { source_type: 'From_Store_OK', number: String(8500 + n) },
          ]);
        }, i);
      }
    },
    ms: 1000,
  },
];

async function captureBurst(page, dir, scenario, prime) {
  mkdirSync(dir, { recursive: true });
  await page.goto(`http://127.0.0.1:${PORT}/?mode=local`);
  await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload));
  await page.evaluate(() => {
    window.QMS.runtime.applyPayload([], { silent: true });
    window.QMS.runtime.applyPayload([], { silent: true });
  });
  if (prime) {
    await prime(page);
  }
  const frames = [];
  const capture = async () => {
    const idx = frames.length;
    const p = join(dir, `f-${String(idx).padStart(3, '0')}.jpg`);
    await page.screenshot({ path: p, type: 'jpeg', quality: 70 });
    frames.push(p);
  };
  await capture();
  await scenario.run(page);
  const end = Date.now() + scenario.ms;
  while (Date.now() < end) {
    await page.waitForTimeout(50);
    await capture();
  }
  return frames;
}

function buildContactSheet(framesDir, outPath) {
  const py = `
import glob, sys
from PIL import Image
paths = sorted(glob.glob(sys.argv[1] + '/f-*.png') + glob.glob(sys.argv[1] + '/f-*.jpg'))[:36]
if not paths:
    paths = sorted(glob.glob(sys.argv[1] + '/*.*'))[:36]
if not paths:
    sys.exit(2)
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
    if (name.startsWith('f-') && (name.endsWith('.png') || name.endsWith('.jpg'))) {
      unlinkSync(join(framesDir, name));
    }
  }
}

export async function buildAllContactSheets() {
  const { startSite } = await import('../tests/e2e/harness.mjs');
  await startSite();
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch();
  const outputs = [];
  for (const viewport of [{ width: 1920, height: 1080, tag: '1920x1080' }, { width: 3840, height: 2160, tag: '3840x2160' }]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    for (const sc of SCENARIOS) {
      const burstDir = join(ART, 'burst', `${viewport.tag}-${sc.id}`);
      await captureBurst(page, burstDir, sc, null);
      const out = join(ART, `${viewport.tag}-${sc.id}.jpg`);
      buildContactSheet(burstDir, out);
      outputs.push(out);
    }
    await ctx.close();
  }
  await browser.close();
  return outputs;
}

if (process.argv[1] && process.argv[1].endsWith('board-animation-contact-sheets.mjs')) {
  buildAllContactSheets()
    .then((paths) => {
      console.log(JSON.stringify(paths, null, 2));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
