/**
 * Hypothesis 0 — per-cycle 3-column leak table (cycles 27–29).
 */

/** @param {import('@playwright/test').Page} ctrl */
export async function readFirestoreTodayBoard(ctrl) {
  return ctrl.evaluate(async () => {
    try {
      const transport =
        window.__controller && window.__controller.getTransport
          ? window.__controller.getTransport()
          : null;
      if (!transport || typeof transport.readBoard !== 'function') {
        return { error: 'no-transport' };
      }
      const doc = await transport.readBoard();
      const tickets = doc && doc.data && Array.isArray(doc.data.tickets) ? doc.data.tickets : [];
      const preparing = [];
      const ready = [];
      for (const t of tickets) {
        const no = String(t.no || '');
        if (!no) {
          continue;
        }
        if (t.status === 'ready') {
          ready.push(no);
        } else {
          preparing.push(no);
        }
      }
      return {
        seq: doc?.data?.seq ?? null,
        updatedAt: doc?.data?.updatedAt ?? null,
        preparing,
        ready,
        has7112InPreparing: preparing.includes('7112'),
        has7112InReady: ready.includes('7112'),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  });
}

/** @param {import('@playwright/test').Page} ctrl */
export async function readPushNumbersSenderLists(ctrl) {
  return ctrl
    .evaluate(() => {
      const prepLines = [...document.querySelectorAll('#list-prep li')].map((li) => li.textContent.trim());
      const readyLines = [...document.querySelectorAll('#list-ready li')].map((li) => li.textContent.trim());
      return { prepLines, readyLines };
    })
    .catch(() => ({ error: 'ctrl-dom-failed' }));
}

/**
 * @param {Array<{ type?: string, preparing?: string[], ready?: string[], t?: number }>} devCommands
 * @param {number} sinceIdx
 */
export function lastPushNumbersSince(devCommands, sinceIdx) {
  const slice = devCommands.slice(sinceIdx);
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    const row = slice[i];
    if (row && (row.type === 'push_numbers' || row.preparing || row.ready)) {
      return row;
    }
  }
  for (let j = devCommands.length - 1; j >= 0; j -= 1) {
    const row = devCommands[j];
    if (row && (row.type === 'push_numbers' || row.preparing || row.ready)) {
      return row;
    }
  }
  return null;
}

/**
 * @param {{ push?: { preparing?: string[], ready?: string[] }, firestore?: { preparing?: string[], ready?: string[] }, board?: { snapshot?: { prep?: string[], ready?: string[] }, slots?: { ready?: Array<{ slot: number, num: string }> } }, apply7112?: { source_type?: string } }} row
 * @returns {'A'|'B'|'C'|'inconclusive'}
 */
export function classifyLeakRow(row) {
  const push = row.push || {};
  const fs = row.firestore || {};
  const snap = row.board?.snapshot || {};
  const pushReady = push.ready || [];
  const pushPrep = push.preparing || [];
  const fsReady = fs.ready || [];
  const fsPrep = fs.preparing || [];
  const inPushReady = pushReady.includes('7112');
  const inPushPrep = pushPrep.includes('7112');
  const inFsReady = fsReady.includes('7112');
  const inFsPrep = fsPrep.includes('7112');
  const inSnapReady = (snap.ready || []).includes('7112');
  const st = row.apply7112?.source_type || '';

  if (inPushReady) {
    return 'A';
  }
  if ((inPushPrep || !inPushReady) && !inPushReady && inFsReady && !inFsPrep) {
    return 'B';
  }
  if (inFsPrep && !inFsReady && inSnapReady) {
    return 'C';
  }
  if (st.includes('Preparing') && inSnapReady) {
    return 'C';
  }
  if (st.includes('_OK') && inSnapReady && !inPushReady) {
    return 'B';
  }
  if (inSnapReady && !inFsReady && !inPushReady) {
    return 'C';
  }
  return 'inconclusive';
}

export function verdictLine(letters) {
  const set = new Set(letters.filter((x) => x === 'A' || x === 'B' || x === 'C'));
  if (set.size === 1) {
    const only = [...set][0];
    if (only === 'A') {
      return '**A)** 送端（push_numbers）已把 7112 列在 ready；看板只是照資料顯示 — 屬測試預期未跟上（非產品顯示邏輯 bug）。';
    }
    if (only === 'B') {
      return '**B)** 送端 ready 未含 7112，但 Firestore today_board 將 7112 標為 ready — 後端／雲端合併問題（需後端介入）。';
    }
    return '**C)** Firestore 仍為 prep，但看板 getSnapshot/DOM 把 7112 放在 ready — 看板 bug（`js/milksha-board.js` `partitionNumberContent` / `applyPayload` 約 164–232、1148–1149 行）。';
  }
  if (set.has('B') && set.has('C')) {
    return '**混合 B/C)** 部分 cycle 雲端 doc 與送端不一致、部分 cycle 看板錯分 — 見下表各列 ABC。';
  }
  return '**待補** GHA 產出 `hypothesis0-cycle-table.json` 後才能定案（見 workflow cross-zone-leak-diagnose）。';
}

/** @param {Array<object>} rows */
export function renderHypothesis0Markdown(rows, runMeta) {
  const letters = rows.map((r) => r.abc);
  const lines = [
    '## Hypothesis 0 — 三欄對照（cycles 27–29）',
    '',
    verdictLine(letters),
    '',
    '**排除「測試正常把 7112 prep→ready」：** 腳本未呼叫 `btn-one-ready`、未對 7112 下 `fireTicket`；僅 seed prep `7100–7111`、ready `8100–8111` 與 mid prep `7200+c`。若 push 仍出現 ready 含 7112，屬送端狀態／後端寫入，非腳本「預期內取餐」。',
    '',
    runMeta ? `資料來源：${runMeta}` : '',
    '',
    '| Cycle | (1) push_numbers 直前（preparing / ready） | (2) Firestore today_board | (3) getSnapshot + ready DOM slots | ABC |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const p1 = fmtLists(r.push?.preparing, r.push?.ready);
    const p2 = fmtLists(r.firestore?.preparing, r.firestore?.ready);
    const snap = `ready=[${tail(r.board?.snapshot?.ready)}] prep7112=${(r.board?.snapshot?.prep || []).includes('7112')}`;
    const slots = fmtSlots(r.board?.slots?.ready);
    lines.push(`| ${r.cycle} | ${p1} | ${p2} | ${snap}; slots ${slots} | **${r.abc}** |`);
  }
  lines.push('');
  return lines.join('\n');
}

function tail(arr) {
  if (!Array.isArray(arr) || !arr.length) {
    return '';
  }
  return arr.slice(0, 4).join(',') + (arr.length > 4 ? ',…' : '');
}

function fmtLists(prep, ready) {
  const p = Array.isArray(prep) ? prep : [];
  const r = Array.isArray(ready) ? ready : [];
  const p7112 = p.includes('7112') ? ' **7112∈prep**' : '';
  const r7112 = r.includes('7112') ? ' **7112∈ready**' : '';
  return `prep(${p.length})${p7112}: …${p.slice(-4).join(',')} / ready(${r.length})${r7112}: …${r.slice(-4).join(',')}`;
}

function fmtSlots(readySlots) {
  if (!Array.isArray(readySlots)) {
    return '—';
  }
  return readySlots
    .filter((s) => s && s.num)
    .map((s) => `${s.slot}:${s.num}`)
    .join(' ');
}
