/** @param {import('@playwright/test').Page} board */
export async function readFrameEvidence(board) {
  return board.evaluate(() => {
    function zoneMotion(z) {
      const root = document.querySelector(`.milksha-zone.${z}`);
      const layer = root?.querySelector('.milksha-zone-numbers');
      const opacity = layer ? Number.parseFloat(getComputedStyle(layer).opacity) : null;
      return {
        pageTurnAnim: layer?.getAttribute('data-page-turn-anim') === '1',
        columnMoveAnim: layer?.getAttribute('data-column-move-anim') === '1',
        numbersLayerOpacity: opacity,
        floatChips: root
          ? root.querySelectorAll('.milksha-board-chip--layer-float').length
          : 0,
        indicator: root?.querySelector('.milksha-pg-indicator')?.textContent?.trim() || '',
      };
    }
    function slots(z) {
      const root = document.querySelector(`.milksha-zone.${z}`);
      return [...(root?.querySelectorAll('.milksha-num-cell') ?? [])].map((cell, idx) => ({
        slot: idx,
        num: cell.querySelector('.milksha-num')?.textContent?.trim() || '',
        itemId: cell.querySelector('.milksha-board-chip')?.getAttribute('data-item-id') || '',
        float: Boolean(cell.querySelector('.milksha-board-chip--layer-float')),
      }));
    }
    const rt = window.QMS?.runtime;
    const snap = rt?.getSnapshot?.();
    const applyLog = (window.__pr53Diag?.applyPayloadCalls ?? []).slice(-40);
    return {
      motion: { prep: zoneMotion('prep'), ready: zoneMotion('ready') },
      slots: { prep: slots('prep'), ready: slots('ready') },
      snapshot: {
        prep: (snap?.preparing ?? []).map((it) => String(it.number)),
        ready: (snap?.ready ?? []).map((it) => String(it.number)),
      },
      applyPayloadTail: applyLog,
    };
  });
}

export function inferMotionInFlight(motion) {
  const parts = [];
  if (motion.ready?.pageTurnAnim || motion.prep?.pageTurnAnim) {
    parts.push('page-turn');
  }
  if (motion.ready?.columnMoveAnim || motion.prep?.columnMoveAnim) {
    parts.push('column-move');
  }
  if ((motion.ready?.floatChips ?? 0) + (motion.prep?.floatChips ?? 0) > 0) {
    parts.push('layer-float');
  }
  const ro = motion.ready?.numbersLayerOpacity;
  const po = motion.prep?.numbersLayerOpacity;
  if ((ro != null && ro < 0.99 && ro > 0.01) || (po != null && po < 0.99 && po > 0.01)) {
    parts.push('numbers-layer-fade');
  }
  return parts.length ? parts.join('+') : 'none';
}
