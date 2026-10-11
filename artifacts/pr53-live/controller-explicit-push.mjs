/**
 * Real-cloud harness: push via controller UI with explicit ticket numbers (no allocateOrderNumber race).
 */
import { expandControllerZone } from '../../tests/e2e/harness.mjs';

/** @param {string} n */
export function isPrepSeriesNumber(n) {
  const x = Number(String(n).trim());
  return Number.isFinite(x) && x >= 7000 && x <= 7999;
}

/** @param {string} n */
export function isReadySeriesNumber(n) {
  const x = Number(String(n).trim());
  return Number.isFinite(x) && x >= 8000 && x <= 8999;
}

/**
 * @param {{ preparing?: string[], ready?: string[] }} params
 */
export function assertPushParams(params) {
  const prep = Array.isArray(params?.preparing) ? params.preparing.map(String) : [];
  const ready = Array.isArray(params?.ready) ? params.ready.map(String) : [];
  for (const n of ready) {
    if (isPrepSeriesNumber(n)) {
      throw new Error(`push_numbers ready contains prep-range number: ${n}`);
    }
  }
  for (const n of prep) {
    if (isReadySeriesNumber(n)) {
      throw new Error(`push_numbers preparing contains ready-range number: ${n}`);
    }
  }
}

/**
 * @param {import('playwright').BrowserContext} ctx
 * @param {Array<{ t: number, preparing: string[], ready: string[], seq: number | null }>} [sink]
 */
export async function installPushNumbersLogger(ctx, sink = []) {
  await ctx.route('**/devCommand**', async (route) => {
    const req = route.request();
    let body = {};
    try {
      body = req.postDataJSON?.() ?? JSON.parse(req.postData() || '{}');
    } catch {
      body = {};
    }
    let seq = null;
    try {
      const res = await route.fetch();
      try {
        const j = await res.json();
        seq = j.boardSeq != null ? Number(j.boardSeq) : j.seq != null ? Number(j.seq) : null;
      } catch {
        /* ignore */
      }
      if (body.type === 'push_numbers') {
        const params = body.params || {};
        assertPushParams(params);
        const row = {
          t: Date.now(),
          preparing: Array.isArray(params.preparing) ? params.preparing.map(String) : [],
          ready: Array.isArray(params.ready) ? params.ready.map(String) : [],
          seq: Number.isFinite(seq) ? seq : null,
        };
        sink.push(row);
        console.log(
          `[push_numbers] seq=${row.seq ?? '?'} prep=${row.preparing.length} ready=${row.ready.length} tail=${row.ready.slice(-3).join(',')}`,
        );
      }
      await route.fulfill({ response: res });
    } catch (e) {
      await route.continue();
    }
  });
  return sink;
}

/**
 * @param {import('@playwright/test').Page} ctrl
 * @param {'preparing'|'ready'} status
 * @param {string} no
 */
export async function pushTicketViaControllerUi(ctrl, status, no) {
  const explicitNo = String(no);
  await expandControllerZone(ctrl, 'sec-pos');
  await ctrl.selectOption('[data-testid="fld-status"]', status);
  await Promise.all([
    ctrl.waitForResponse(
      (res) => res.url().includes('devCommand') && res.request().method() === 'POST',
      { timeout: 120000 },
    ),
    ctrl.evaluate(
      ({ status: st, no: ticketNo }) => {
        const fldStatus = document.getElementById('fld-status');
        const fldNo = document.getElementById('fld-no');
        const btn = document.getElementById('btn-add-ticket');
        if (!fldStatus || !fldNo || !btn) {
          throw new Error('controller add-ticket controls missing');
        }
        fldStatus.value = st;
        fldNo.value = String(ticketNo);
        btn.click();
      },
      { status, no: explicitNo },
    ),
  ]);
  await ctrl.waitForFunction(
    ({ ticketNo }) => document.getElementById('fld-no')?.value === String(ticketNo),
    { ticketNo: explicitNo },
    { timeout: 5000 },
  ).catch(() => {});
}

/**
 * @param {import('@playwright/test').Page} ctrl
 * @param {import('@playwright/test').Page} board
 * @param {'preparing'|'ready'} status
 * @param {string} no
 * @param {'prep'|'ready'} [zone]
 */
export async function addTicketExplicit(ctrl, board, status, no, zone) {
  const t0 = Date.now();
  await pushTicketViaControllerUi(ctrl, status, no);
  const zn = zone || (status === 'ready' ? 'ready' : 'prep');
  await board
    .waitForFunction(
      ({ z, n }) =>
        [...document.querySelectorAll(`.milksha-zone.${z} .milksha-num`)].some((el) => el.textContent.trim() === n),
      { z: zn, n: String(no) },
      { timeout: 20000 },
    )
    .catch(() => {});
  return Date.now() - t0;
}
