/** Browser init script body (string) — hooks applyPayload + receiveBoard; no product changes. */
export const DIAG_INIT_SCRIPT = () => {
  window.__pr53Diag = {
    applyPayloadCalls: [],
    receiveBoardCalls: [],
    apply7112Traces: [],
  };
  function wrap() {
    const rt = window.QMS?.runtime;
    if (rt && typeof rt.applyPayload === 'function' && !rt.__pr53DiagWrapped) {
      const orig = rt.applyPayload.bind(rt);
      rt.applyPayload = function pr53DiagApplyPayload(list, opts) {
        let prep = 0;
        let ready = 0;
        if (Array.isArray(list)) {
          for (const it of list) {
            const st = it && it.source_type ? String(it.source_type) : '';
            if (st.includes('OK')) {
              ready += 1;
            } else if (st.includes('Preparing')) {
              prep += 1;
            }
          }
        }
        let item7112 = null;
        if (Array.isArray(list)) {
          for (const it of list) {
            if (it && String(it.number) === '7112') {
              item7112 = {
                source_type: it.source_type ? String(it.source_type) : '',
                number: String(it.number),
              };
              break;
            }
          }
        }
        const prepNums = [];
        const readyNums = [];
        if (Array.isArray(list)) {
          for (const it of list) {
            if (!it || it.number == null) {
              continue;
            }
            const st = it.source_type ? String(it.source_type) : '';
            if (st.includes('OK') || st === 'ready') {
              readyNums.push(String(it.number));
            } else {
              prepNums.push(String(it.number));
            }
          }
        }
        window.__pr53Diag.lastAppliedPayload = {
          t: Date.now(),
          preparing: prepNums,
          ready: readyNums,
          item7112,
        };
        const entry = {
          t: Date.now(),
          len: Array.isArray(list) ? list.length : 0,
          prep,
          ready,
          silent: Boolean(opts && opts.silent),
          item7112,
          preparingNumbers: prepNums,
          readyNumbers: readyNums,
        };
        window.__pr53Diag.applyPayloadCalls.push(entry);
        if (item7112 || prepNums.includes('7112') || readyNums.includes('7112')) {
          const items = [];
          if (Array.isArray(list)) {
            for (const it of list) {
              if (!it || it.number == null) {
                continue;
              }
              items.push({
                number: String(it.number),
                source_type: it.source_type ? String(it.source_type) : '',
              });
            }
          }
          window.__pr53Diag.apply7112Traces.push({
            t: entry.t,
            silent: entry.silent,
            item7112,
            items,
          });
        }
        return orig(list, opts);
      };
      rt.__pr53DiagWrapped = true;
    }
    const rc = window.receiverCloud;
    if (rc && typeof rc.receiveBoard === 'function' && !rc.__pr53DiagWrapped) {
      const origR = rc.receiveBoard.bind(rc);
      rc.receiveBoard = function pr53DiagReceiveBoard(payload) {
        window.__pr53Diag.receiveBoardCalls.push({
          t: Date.now(),
          tickets: Boolean(payload && payload.tickets),
          request: Boolean(payload && payload.request),
          silent: Boolean(payload && payload.silent),
        });
        return origR(payload);
      };
      rc.__pr53DiagWrapped = true;
    }
  }
  wrap();
  setInterval(wrap, 50);
};

/**
 * @param {import('@playwright/test').Page} board
 */
export async function drainDiagRound(board) {
  return board.evaluate(() => {
    const tl = Array.isArray(window.__rcvMatrixTimeline) ? window.__rcvMatrixTimeline.slice() : [];
    const snapKinds = tl.filter((e) => e && e.kind === 'board_snapshot');
    const out = {
      applyPayloadCount: window.__pr53Diag?.applyPayloadCalls?.length ?? 0,
      applyPayloadCalls: (window.__pr53Diag?.applyPayloadCalls ?? []).slice(),
      receiveBoardCount: window.__pr53Diag?.receiveBoardCalls?.length ?? 0,
      receiveBoardCalls: (window.__pr53Diag?.receiveBoardCalls ?? []).slice(),
      boardSnapshotEvents: snapKinds.length,
      timelineTail: tl.slice(-30),
    };
    if (window.__pr53Diag) {
      window.__pr53Diag.applyPayloadCalls = [];
      window.__pr53Diag.receiveBoardCalls = [];
    }
    return out;
  });
}
