/**
 * Controller shell: connection pill, quick-send feedback, clear-board copy (testable).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Controller = QMS.Controller || {};

  /**
   * @param {{ connected: boolean, boardOnline?: boolean, boardHint?: string }} state
   * @returns {string}
   */
  function formatConnectionPillLabel(state) {
    if (!state || !state.connected) {
      return '未連線';
    }
    if (state.boardHint) {
      return '已連線 · ' + state.boardHint;
    }
    if (state.boardOnline) {
      return '已連線 · 看板在線';
    }
    return '已連線 · 看板離線';
  }

  /**
   * @param {string} storeId
   * @returns {string}
   */
  function buildClearBoardModalBody(storeId) {
    const id = String(storeId || '').trim() || '—';
    return '門市 ' + id + ' 上的準備中與可取餐號碼將全部移除，此動作無法自動復原。';
  }

  /**
   * @param {{ isSuccess?: boolean } | null | undefined} res
   * @returns {boolean}
   */
  function shouldShowQuickSendSuccess(res) {
    return Boolean(res && res.isSuccess === true);
  }

  /**
   * @param {{ no: string, sourceLabel: string, statusLabel: string }} ticket
   * @returns {string}
   */
  function formatQuickSendSuccessLine(ticket) {
    const no = String(ticket.no || '').trim();
    const source = String(ticket.sourceLabel || '').trim();
    const status = String(ticket.statusLabel || '').trim();
    return '已送出 ' + no + '（' + source + ' · ' + status + '）';
  }

  /** @returns {string} */
  function quickSendFailureSurface() {
    return 'quick-send-rule-note';
  }

  QMS.Controller.View = {
    formatConnectionPillLabel: formatConnectionPillLabel,
    buildClearBoardModalBody: buildClearBoardModalBody,
    shouldShowQuickSendSuccess: shouldShowQuickSendSuccess,
    formatQuickSendSuccessLine: formatQuickSendSuccessLine,
    quickSendFailureSurface: quickSendFailureSurface,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
