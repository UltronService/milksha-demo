/**
 * Network + hook capture for hypothesis 0 (is 7112 ready in cloud data?).
 */

/** @param {import('playwright').BrowserContext} ctx */
export async function installHypothesis0Capture(ctx) {
  const log = {
    devCommands: [],
    todayBoardReads: [],
  };
  await ctx.route('**/devCommand**', async (route) => {
    try {
      const req = route.request();
      const body = req.postDataJSON?.() ?? JSON.parse(req.postData() || '{}');
      if (body && body.type === 'push_numbers') {
        const params = body.params || {};
        const prep = Array.isArray(params.preparing) ? params.preparing.map(String) : [];
        const ready = Array.isArray(params.ready) ? params.ready.map(String) : [];
        log.devCommands.push({
          t: Date.now(),
          type: body.type,
          preparing: prep,
          ready: ready,
          has7112InPreparing: prep.includes('7112'),
          has7112InReady: ready.includes('7112'),
        });
      } else {
        log.devCommands.push({ t: Date.now(), type: body?.type || 'unknown' });
      }
    } catch {
      /* ignore */
    }
    await route.continue();
  });
  return log;
}

/** @param {import('@playwright/test').Page} ctrl */
export async function readController7112(ctrl) {
  return ctrl
    .evaluate(() => {
      const prepLines = [...document.querySelectorAll('#list-prep li')].map((li) => li.textContent.trim());
      const readyLines = [...document.querySelectorAll('#list-ready li')].map((li) => li.textContent.trim());
      return {
        fldNo: document.getElementById('fld-no')?.value || '',
        fldStatus: document.getElementById('fld-status')?.value || '',
        simRunning: Boolean(document.querySelector('[data-testid="btn-sim-stop"]:not([disabled])')),
        prepListTail: prepLines.slice(-6),
        readyListTail: readyLines.slice(-6),
        has7112InReadyList: readyLines.some((line) => line.startsWith('7112')),
        has7112InPrepList: prepLines.some((line) => line.startsWith('7112')),
      };
    })
    .catch(() => ({ error: 'ctrl-eval-failed' }));
}

export function lookup7112InApplyLog(calls) {
  const hits = [];
  for (const c of calls || []) {
    if (c.item7112) {
      hits.push({ t: c.t, item7112: c.item7112, silent: c.silent, len: c.len });
    }
  }
  return hits;
}

export function summarizeHypothesis0({ apply7112, devCommands, todayBoardReads, controller, frame }) {
  const lastPush = [...devCommands].reverse().find((d) => d.type === 'push_numbers');
  const lastBoard = todayBoardReads[todayBoardReads.length - 1];
  const applyHit = apply7112[apply7112.length - 1];
  let verdict = 'inconclusive';
  let upstream = null;
  if (applyHit?.item7112?.source_type?.includes('_OK')) {
    verdict = 'cloud-data-ready';
    upstream = 'applyPayload / Firestore list marks From_Store_OK';
  } else if (applyHit?.item7112?.source_type?.includes('Preparing')) {
    verdict = 'board-misfile';
    upstream = 'js/milksha-board.js applyPayload → readyItems';
  } else if (lastPush?.has7112InReady) {
    verdict = 'controller-or-backend-ready';
    upstream = 'controller push_numbers params.ready (controller/controller-app.js ticketsToPushParams)';
  } else if (controller?.tickets7112?.some((t) => t.status === 'ready')) {
    verdict = 'controller-local-ready';
    upstream = 'controller tickets[] before push';
  } else if (lastBoard?.has7112InReady) {
    verdict = 'firestore-ready';
    upstream = 'stores/.../board/today_board';
  } else if (!applyHit && frame?.snapshot?.ready?.includes('7112')) {
    verdict = 'board-state-without-7112-in-last-apply';
    upstream = 'js/milksha-board.js internal merge after apply';
  }
  return {
    verdict,
    upstream,
    apply7112Tail: apply7112.slice(-5),
    lastPushNumbers: lastPush || null,
    lastTodayBoardRead: lastBoard || null,
    controller7112: controller,
  };
}
