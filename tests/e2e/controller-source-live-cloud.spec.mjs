import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';
import { installLiveBranchCloudRoutes, GITHUB_PAGES_BASE } from './board-animation-live-setup.mjs';
import { LIVE_CLOUD_BOARD_DEVICE, LIVE_CLOUD_STORE_ID } from './live-cloud-config.mjs';
import { sendClearNow, teardownLiveCloudSession } from './live-cloud-teardown.mjs';

if (LIVE_CLOUD_STORE_ID === 'zz-qa-store-a') {
  throw new Error('Refusing zz-qa-store-a; use zz-qa-ci-store');
}

/** @type {import('playwright').Browser | undefined} */
let browser;
/** @type {import('@playwright/test').Page | undefined} */
let board;
/** @type {import('@playwright/test').Page | undefined} */
let ctrl;

async function syncLiveCloudBoard(page) {
  await page.evaluate(async function () {
    const rc = window.receiverCloud;
    if (!rc) {
      return;
    }
    if (rc.triggerDevicePoll) {
      await rc.triggerDevicePoll();
    }
    if (rc.triggerBoardPoll) {
      await rc.triggerBoardPoll({ force: true });
    }
  });
}

async function waitForBoardReadyCount(page, n) {
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    await syncLiveCloudBoard(page);
    const count = await page.evaluate(function () {
      const rt = window.QMS && window.QMS.runtime;
      if (rt && rt.getSnapshot) {
        const snap = rt.getSnapshot();
        if (snap && Array.isArray(snap.ready)) {
          return snap.ready.length;
        }
      }
      return document.querySelectorAll('.milksha-ready .milksha-num').length;
    });
    if (count >= n) {
      return;
    }
    await page.waitForTimeout(2500);
  }
  throw new Error('board ready count did not reach ' + n);
}

async function waitForReadyNumberCount(page, displayNo, minCount) {
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    await syncLiveCloudBoard(page);
    const count = await page.evaluate(function (num) {
      const rt = window.QMS && window.QMS.runtime;
      if (rt && rt.getSnapshot) {
        const snap = rt.getSnapshot();
        if (snap && Array.isArray(snap.ready)) {
          return snap.ready.filter(function (r) {
            return r && r.number === num;
          }).length;
        }
      }
      const nodes = document.querySelectorAll('.milksha-ready .milksha-num');
      let n = 0;
      for (let i = 0; i < nodes.length; i += 1) {
        if ((nodes[i].textContent || '').trim() === num) {
          n += 1;
        }
      }
      return n;
    }, displayNo);
    if (count >= minCount) {
      return;
    }
    await page.waitForTimeout(2500);
  }
  throw new Error('ready count for ' + displayNo + ' did not reach ' + minCount);
}

async function readCloudReadyTickets(ctrlPage) {
  return ctrlPage.evaluate(async function () {
    const transport =
      window.__controller && window.__controller.getTransport ? window.__controller.getTransport() : null;
    if (!transport || !transport.readBoard) {
      return null;
    }
    const doc = await transport.readBoard();
    const tickets = doc && doc.data && doc.data.tickets ? doc.data.tickets : [];
    return tickets
      .filter(function (t) {
        return t && t.status === 'ready';
      })
      .map(function (t) {
        return {
          no: String(t.no),
          sourceType: t.sourceType != null ? String(t.sourceType) : String(t.source_type || ''),
        };
      });
  });
}

test.afterEach(async () => {
  try {
    await teardownLiveCloudSession(ctrl, board);
  } finally {
    if (browser) {
      await browser.close();
    }
    browser = undefined;
    board = undefined;
    ctrl = undefined;
  }
});

test.describe(`${LIVE_CLOUD_STORE_ID} controller push_numbers sources (live cloud)`, () => {
  test.describe.configure({ retries: 1 });

  // 負責人 10/14 決定暫不處理，之後再說（clear_now 後再 push_numbers 真雲端）
  test.skip('push_numbers five sourceTypes via controller devCommand payload', async () => {
    test.setTimeout(480000);

    browser = await chromium.launch();
    const ctx = await browser.newContext();
    ctx.setDefaultTimeout(180000);
    await installLiveBranchCloudRoutes(ctx);

    board = await ctx.newPage();
    ctrl = await ctx.newPage();
    const ctrlNav = ctrl.goto(`${GITHUB_PAGES_BASE}/controller/?mode=cloud&store=${LIVE_CLOUD_STORE_ID}`);
    await board.goto(
      `${GITHUB_PAGES_BASE}/?mode=cloud&store=${LIVE_CLOUD_STORE_ID}&device=${LIVE_CLOUD_BOARD_DEVICE}`,
    );
    await board.waitForFunction(() => Boolean(window.receiverCloud), undefined, { timeout: 180000 });
    await ctrlNav;
    await ctrl.waitForSelector('#online-state[data-connected="1"]', { timeout: 180000 });
    await ctrl.waitForFunction(
      () => document.getElementById('online-state')?.getAttribute('data-board-online') === '1',
      undefined,
      { timeout: 180000 },
    );
    await sendClearNow(ctrl);
    await board.waitForTimeout(4000);

    const sends = [
      { source: 'store', no: '1234' },
      { source: 'uber', no: '1234' },
      { source: 'point', no: '091' },
      { source: 'fp', no: '#6406' },
      { source: 'udd', no: 'ab12' },
    ];

    const pushResult = await ctrl.evaluate(async function (rows) {
      const Send = window.QMS.Controller.SendNumber;
      const DevCmd = window.QMS.Transport.DevCommandValidation;
      const transport = window.__controller.getTransport();
      if (!Send || !DevCmd || !transport || !transport.cloudApi) {
        return { ok: false, reason: 'missing_apis' };
      }
      const ready = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const validated = Send.validateQuickSendNumber(row.source, row.no);
        if (!validated.ok) {
          return { ok: false, reason: 'validate', step: i, message: validated.message };
        }
        const def = Send.sourceOptionForKey(row.source);
        ready.push({ no: validated.normalized, sourceType: def.ok });
      }
      const built = DevCmd.buildDevCommandRequest({
        storeId: document.getElementById('fld-store').value.trim(),
        deviceId: (document.getElementById('fld-device').value || 'stb-01').trim(),
        type: 'push_numbers',
        params: { ready: ready, preparing: [] },
      });
      if (!built.ok) {
        return { ok: false, reason: 'build', message: built.message, code: built.code };
      }
      try {
        const res = await transport.cloudApi.devCommand(built.body);
        return { ok: true, params: built.body.params, res: res };
      } catch (e) {
        return {
          ok: false,
          reason: 'devCommand',
          message: e && e.message ? String(e.message) : 'unknown',
          status: e && e.status ? e.status : 0,
          response: e && e.response ? e.response : null,
        };
      }
    }, sends);

    expect(pushResult.ok).toBe(true);
    expect(pushResult.params.ready.length).toBe(5);
    expect(
      pushResult.params.ready.some(function (e) {
        return e.sourceType === 'From_Store_OK' && e.no === '1234';
      }),
    ).toBe(true);
    expect(
      pushResult.params.ready.some(function (e) {
        return e.sourceType === 'From_UberEat_OK' && e.no === '1234';
      }),
    ).toBe(true);

    await waitForBoardReadyCount(board, 5);
    await waitForReadyNumberCount(board, '1234', 2);

    const cloudReady = await readCloudReadyTickets(ctrl);
    expect(cloudReady, 'cloud readBoard ready tickets').not.toBeNull();
    const cloud1234 = (cloudReady || []).filter(function (t) {
      return t.no === '1234';
    });
    expect(cloud1234.length).toBeGreaterThanOrEqual(2);

    await expect(board.locator('.milksha-ready .milksha-num')).toHaveCount(5, { timeout: 60000 });
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: '1234' })).toHaveCount(2, {
      timeout: 60000,
    });
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: '091' })).toHaveCount(1);
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: '6406' })).toHaveCount(1);
    await expect(board.locator('.milksha-ready .milksha-num', { hasText: 'AB12' })).toHaveCount(1);
  });
});
