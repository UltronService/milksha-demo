#!/usr/bin/env node
/**
 * Structured icon display debug @ 64px preview + original vs fixed compare PNG.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startStaticServer, serverPort } from './source-icons-static-server.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(rootDir, 'mockups', 'artifacts', 'source-icons-mockup');
const FONT_PX = 64;

async function measurePreviewIcons(page) {
  return page.evaluate(function (fontPx) {
    const srcMeta = {
      nidin: { file: 'assets/source-icons/nidin.png', native: { w: 183, h: 91 } },
      fp: { file: 'assets/source-icons/foodpanda.png', native: { w: 800, h: 782 } },
      uber: { file: 'assets/source-icons/ubereats.png', native: { w: 800, h: 800 } },
    };
    function classKey(el) {
      if (el.classList.contains('source-icons-live__icon--nidin')) {
        return 'nidin';
      }
      if (el.classList.contains('source-icons-live__icon--fp')) {
        return 'fp';
      }
      if (el.classList.contains('source-icons-live__icon--uber')) {
        return 'uber';
      }
      return 'unknown';
    }
    const rows = [];
    document.querySelectorAll('.source-icons-live__icon').forEach(function (img, idx) {
      const key = classKey(img);
      const box = img.closest('.source-icons-live__icon-box');
      const slot = img.closest('.source-icons-live__icon-slot');
      const chip = img.closest('.milksha-board-chip');
      const ir = img.getBoundingClientRect();
      const br = box ? box.getBoundingClientRect() : null;
      const sr = slot ? slot.getBoundingClientRect() : null;
      const cs = getComputedStyle(img);
      const ss = slot ? getComputedStyle(slot) : null;
      const nat = srcMeta[key] || { native: { w: img.naturalWidth, h: img.naturalHeight } };
      const dispRatio = ir.width > 0 ? ir.width / ir.height : 0;
      const natRatio = nat.native.w / nat.native.h;
      rows.push({
        index: idx,
        sourceKey: key,
        itemId: chip ? chip.getAttribute('data-item-id') : null,
        natural_px: { w: img.naturalWidth, h: img.naturalHeight, ratio: img.naturalWidth / img.naturalHeight },
        displayed_px: {
          w: ir.width,
          h: ir.height,
          ratio: dispRatio,
        },
        icon_box_px: br ? { w: br.width, h: br.height, overflow: box ? getComputedStyle(box).overflow : null } : null,
        slot_px: sr
          ? { w: sr.width, h: sr.height, overflow: ss ? ss.overflow : null }
          : null,
        css: {
          width: cs.width,
          height: cs.height,
          objectFit: cs.objectFit,
          maxWidth: cs.maxWidth,
        },
        ratio_delta_vs_native: Math.abs(dispRatio - natRatio),
        likely_distorted: Math.abs(dispRatio - natRatio) > 0.02,
        box_clips_painted:
          br &&
          (function () {
            const boxSide = br.width;
            const scale = Math.min(boxSide / img.naturalWidth, boxSide / img.naturalHeight);
            const pw = img.naturalWidth * scale;
            const ph = img.naturalHeight * scale;
            return pw > boxSide + 0.5 || ph > boxSide + 0.5;
          })(),
      });
    });
    const slotW = fontPx * 1;
    const capH = (fontPx * 58) / 81;
    const iconBox = fontPx * 0.8;
    return {
      fontPx: fontPx,
      css_expect_px: {
        slotW: slotW,
        capH: capH,
        iconBoxS: iconBox,
      },
      icons: rows,
    };
  }, FONT_PX);
}

async function captureCompareDiagnostic(page, port) {
  const htmlPath = path.join(outDir, 'source-icons-icon-debug-compare.html');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><base href="/" />
<style>
body{margin:0;background:#1a1a1a;font-family:Arial,sans-serif;color:#eee}
.row{display:flex;gap:32px;padding:24px;align-items:flex-start;border-bottom:1px solid #444}
.panel{background:#fff;padding:12px}
.panel h3{margin:0 0 8px;font-size:18px;color:#222;text-align:center}
.box{position:relative;display:inline-block;background:repeating-conic-gradient(#ccc 0% 25%, #eee 0% 50%) 50%/16px 16px}
img{display:block}
.slot-sim{overflow:hidden;background:rgba(255,0,0,0.08);outline:2px dashed #e53935;position:relative}
.crop{position:absolute;border:2px solid #e53935;box-sizing:border-box;pointer-events:none}
label{font-size:14px;color:#ccc;display:block;margin:8px 0 4px}
</style></head><body>
<script>
const F=64;
const slotW=F*1, capH=F*58/81, boxS=F*0.8;
const specs=[
  {key:'nidin',src:'/assets/source-icons/nidin.png'},
  {key:'foodpanda',src:'/assets/source-icons/foodpanda.png'},
  {key:'uber',src:'/assets/source-icons/ubereats.png'},
];
function addRow(spec){
  const row=document.createElement('div'); row.className='row';
  const left=document.createElement('div'); left.className='panel';
  left.innerHTML='<h3>原圖 '+spec.key+'</h3>';
  const nat=document.createElement('img'); nat.src=spec.src; nat.style.maxHeight='220px'; nat.width=nat.naturalWidth;
  left.appendChild(nat);
  const right=document.createElement('div'); right.className='panel';
  right.innerHTML='<h3>修後 64px（綠框=S×S '+boxS.toFixed(1)+'，外層 slot '+slotW.toFixed(1)+'×'+capH.toFixed(1)+'）</h3>';
  const outer=document.createElement('div'); outer.className='slot-sim';
  outer.style.width=slotW+'px'; outer.style.height=capH+'px';
  outer.style.display='flex'; outer.style.alignItems='center'; outer.style.justifyContent='center';
  outer.style.overflow='visible'; outer.style.outline='1px dashed #888';
  const sim=document.createElement('div'); sim.className='slot-sim';
  sim.style.width=boxS+'px'; sim.style.height=boxS+'px';
  sim.style.display='flex'; sim.style.alignItems='center'; sim.style.justifyContent='center';
  sim.style.overflow='visible';
  const img=document.createElement('img'); img.src=spec.src;
  img.style.width='100%'; img.style.height='100%'; img.style.objectFit='contain';
  sim.appendChild(img); outer.appendChild(sim); right.appendChild(outer);
  row.appendChild(left); row.appendChild(right);
  document.body.appendChild(row);
  img.onload=function(){
    const sr=sim.getBoundingClientRect();
    const scale=Math.min(sr.width/img.naturalWidth,sr.height/img.naturalHeight);
    const pw=img.naturalWidth*scale, ph=img.naturalHeight*scale;
    const note=document.createElement('label');
    note.textContent='contain 繪製 ≈ '+pw.toFixed(1)+'×'+ph.toFixed(1)+'px，比例 '+(pw/ph).toFixed(3)
      +'；S×S 框 '+sr.width.toFixed(1)+'×'+sr.height.toFixed(1)+'，overflow:visible';
    right.appendChild(note);
  };
}
specs.forEach(addRow);
</script></body></html>`;
  writeFileSync(htmlPath, html);
  await page.goto('http://127.0.0.1:' + port + '/mockups/artifacts/source-icons-mockup/source-icons-icon-debug-compare.html', {
    waitUntil: 'networkidle',
  });
  await page.waitForTimeout(800);
  const pngPath = path.join(outDir, 'source-icons-icon-debug-original-vs-64px-fixed.png');
  await page.screenshot({ path: pngPath, fullPage: true });
  return { htmlPath, pngPath };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const server = await startStaticServer(rootDir, 0);
  const port = serverPort(server);
  const browser = await chromium.launch();

  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  await page.goto(
    'http://127.0.0.1:' + port + '/mockups/source-icons-font-preview.html?fontPx=64&markOverflow=0',
    { waitUntil: 'networkidle' },
  );
  await page.waitForFunction(function () {
    return document.getElementById('board-root')?.dataset.mockupLayoutReady === 'true';
  });
  await page.waitForFunction(function () {
    var imgs = document.querySelectorAll('.source-icons-live__icon');
    for (var i = 0; i < imgs.length; i += 1) {
      if (!imgs[i].complete || imgs[i].naturalWidth === 0) {
        return false;
      }
    }
    return imgs.length > 0;
  });

  const previewMeasures = await measurePreviewIcons(page);
  await page.close();

  const diagPage = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const compare = await captureCompareDiagnostic(diagPage, port);
  await diagPage.close();
  await browser.close();
  await new Promise(function (r) {
    server.close(function () {
      r(undefined);
    });
  });

  const sourceAnalysis = JSON.parse(
    readFileSync(path.join(outDir, 'source-icons-source-files-analysis.json'), 'utf8'),
  );

  const report = {
    fontPxPreview: FONT_PX,
    preview_png: 'mockups/artifacts/source-icons-mockup/source-icons-font-preview-64px-1920x1080.png',
    source_files: sourceAnalysis,
    preview_dom_measures: previewMeasures,
    compare_artifact: {
      png: 'mockups/artifacts/source-icons-mockup/source-icons-icon-debug-original-vs-64px-fixed.png',
      html: 'mockups/artifacts/source-icons-mockup/source-icons-icon-debug-compare.html',
    },
    sizing_rules_applied: {
      iconBoxS: '0.8 × F',
      slotW: '1.0 × F',
      gap: '0.2 × F',
      objectFit: 'contain',
      slotOverflow: 'visible',
    },
  };

  writeFileSync(path.join(outDir, 'source-icons-icon-debug-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
