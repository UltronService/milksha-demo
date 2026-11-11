/** Browser init script body (string) — hooks applyPayload + receiveBoard; no product changes. */
export const DIAG_INIT_SCRIPT = () => {
  window.__pr53Diag = {
    applyPayloadCalls: [],
    receiveBoardCalls: [],
  };
  function wrap() {
    const rt = window.QMS?.runtime;
    if (rt && typeof rt.applyPayload === 'function' && !rt.__pr53DiagWrapped) {
      const orig = rt.applyPayload.bind(rt);
      rt.applyPayload = function pr53DiagApplyPayload(list, opts) {
        window.__pr53Diag.applyPayloadCalls.push({
          t: Date.now(),
          len: Array.isArray(list) ? list.length : 0,
          silent: Boolean(opts && opts.silent),
        });
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
