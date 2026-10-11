import { expectedPageSet, setsEqual } from './qa-harness-core.mjs';

/**
 * Score one settled sample (indicator stable + opacity >= 0.99).
 * @param {import('@playwright/test').Page} board
 */
export async function scoreSettledFrame(board, { prepSent, readySent, prevIndicators }) {
  return board.evaluate(
    ({ prepSent: prepS, readySent: readyS, prevIndicators: prev }) => {
      const pageSize = 10;
      function zoneState(zKey) {
        const root = document.querySelector(`.milksha-zone.${zKey}`);
        const layer = root?.querySelector('.milksha-zone-numbers');
        const opacity = layer ? Number.parseFloat(getComputedStyle(layer).opacity) : 0;
        const opacityOk = opacity >= 0.99;
        const ind = root?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '';
        const prevInd = prev[zKey] || '';
        const indicatorStable = Boolean(ind) && ind === prevInd;
        const numsLoose = [...(root?.querySelectorAll('.milksha-num') ?? [])]
          .map((n) => n.textContent.trim())
          .filter(Boolean);
        const domSlots = [...(root?.querySelectorAll('.milksha-num-cell .milksha-num') ?? [])].map((e) =>
          e.textContent.trim(),
        );
        return { opacityOk, ind, indicatorStable, numsLoose, domSlots };
      }

      function slotScore(zKey, sentAsc, st) {
        if (!st.opacityOk || !st.indicatorStable) {
          return { skipped: true, reason: !st.opacityOk ? 'opacity' : 'indicator', ind: st.ind };
        }
        const m = st.ind.match(/^(\d+)\/(\d+)$/);
        if (!m) {
          return { skipped: true, reason: 'no-indicator', ind: st.ind };
        }
        const pageIndex = Number.parseInt(m[1], 10) - 1;
        const start = pageIndex * pageSize;
        const rt = window.QMS?.runtime;
        const snap = rt?.getSnapshot?.();
        const items = zKey === 'prep' ? snap?.preparing : snap?.ready;
        if (!items || !Array.isArray(items)) {
          return { skipped: true, reason: 'no-snapshot', ind: st.ind };
        }
        const expected = items.slice(start, start + pageSize).map((it) => String(it.number));
        let slotOk = true;
        for (let i = 0; i < pageSize; i += 1) {
          if ((expected[i] || '') !== (st.domSlots[i] || '')) {
            slotOk = false;
          }
        }
        const expectedFilled = expected.filter(Boolean).length;
        const domFilled = st.domSlots.filter(Boolean).length;
        const lastPageTenOld = expectedFilled < pageSize && domFilled > expectedFilled;
        const newestFirst = sentAsc.slice().reverse();
        const expSetArr = newestFirst.slice(start, start + pageSize);
        const expSet = new Set(expSetArr);
        const visSet = new Set(st.numsLoose);
        let qaSetOk = expSet.size === visSet.size;
        if (qaSetOk) {
          for (const x of expSet) {
            if (!visSet.has(x)) {
              qaSetOk = false;
              break;
            }
          }
        }
        return {
          skipped: false,
          ind: st.ind,
          pageIndex,
          slotOk,
          qaSetOk,
          lastPageTenOld,
          expectedFilled,
          domFilled,
          expected: expected.filter(Boolean),
          dom: st.domSlots.filter(Boolean),
          numsLoose: st.numsLoose,
        };
      }

      const prepSt = zoneState('prep');
      const readySt = zoneState('ready');
      const prep = slotScore('prep', prepS, prepSt);
      const ready = slotScore('ready', readyS, readySt);
      let prepInReady = [];
      if (readySt.opacityOk && readySt.indicatorStable) {
        const prepInReadyLoose = readySt.numsLoose.filter((n) => /^7\d{3}$/.test(n));
        const prepInReadySlots = readySt.domSlots.filter((n) => n && /^7\d{3}$/.test(n));
        prepInReady = [...new Set([...prepInReadyLoose, ...prepInReadySlots])];
      }
      return {
        prep,
        ready,
        prepInReady,
        nextPrevIndicators: {
          prep: prepSt.ind || prev.prep,
          ready: readySt.ind || prev.ready,
        },
      };
    },
    { prepSent, readySent, prevIndicators },
  );
}

/** Node-side set equal for summaries */
export { expectedPageSet, setsEqual };
