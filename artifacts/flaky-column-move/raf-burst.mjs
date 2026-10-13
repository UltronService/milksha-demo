/** rAF-dense sampling right after 6th ready payload (diagnostic). */
import { chromium } from '@playwright/test';
import { primeBoardForAnimation } from '../../tests/e2e/board-animation-helpers.mjs';
import {
  readyPayload,
  applyPayload,
  sequentialNumbers,
} from '../../tests/e2e/board-column-move-helpers.mjs';
import { urlsLocalHomePoc } from '../../tests/e2e/harness.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const { board } = urlsLocalHomePoc();
await page.goto(`${board}${board.includes('?') ? '&' : '?'}motion=on`);
await page.waitForFunction(() => Boolean(window.QMS?.runtime?.applyPayload), undefined, { timeout: 25000 });
await primeBoardForAnimation(page);
const nums = sequentialNumbers(6701, 5);
await applyPayload(page, readyPayload(nums));
await page.waitForTimeout(400);

const burst = await page.evaluate(async (rows) => {
  const idx = 5;
  const burst = [];
  const start = performance.now();
  const done = new Promise((resolve) => {
    function frame() {
      const zoneEl = document.querySelector('.milksha-zone.ready');
      const cell = zoneEl?.querySelectorAll('.milksha-num-cell')[idx];
      const chip = cell?.querySelector('.milksha-board-chip:not(.milksha-board-chip--layer-float)');
      const cs = chip ? getComputedStyle(chip) : null;
      const anims = chip?.getAnimations?.() ?? [];
      burst.push({
        t: Math.round(performance.now() - start),
        itemId: chip?.getAttribute('data-item-id'),
        transform: cs?.transform,
        animCount: anims.length,
        playState: anims[0]?.playState,
      });
      if (performance.now() - start < 350) {
        requestAnimationFrame(frame);
      } else {
        resolve(burst);
      }
    }
    window.QMS.runtime.applyPayload(rows);
    requestAnimationFrame(frame);
  });
  return done;
}, [...nums, nums[nums.length - 1] + 1].map((n) => ({ source_type: 'From_Store_OK', number: String(n) })));

const withMotion = burst.filter((b) => b.transform && b.transform !== 'none');
console.log(JSON.stringify({ frames: burst.length, motionFrames: withMotion.length, burst }, null, 2));
await browser.close();
