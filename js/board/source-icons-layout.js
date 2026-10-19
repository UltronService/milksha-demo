/**
 * Production source-icon row layout (PR #74): slot 1.0F, gap 0.2F, icon box S=0.8F.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});

  const SOURCE_ICON_SRC = {
    point: 'assets/source-icons/nidin.png',
    fp: 'assets/source-icons/foodpanda.png',
    uber: 'assets/source-icons/ubereats.png',
  };

  const ICON_SOURCE_KEYS = ['point', 'fp', 'uber'];

  /**
   * @param {string} sourceKey
   * @returns {boolean}
   */
  function sourceKeyShowsIcon(sourceKey) {
    return ICON_SOURCE_KEYS.indexOf(sourceKey) >= 0;
  }

  /**
   * @param {string} sourceKey
   * @returns {string}
   */
  function iconSrcForSourceKey(sourceKey) {
    return SOURCE_ICON_SRC[sourceKey] || '';
  }

  /**
   * @param {string} sourceKey
   * @returns {string}
   */
  function iconClassSuffix(sourceKey) {
    if (sourceKey === 'point') {
      return 'nidin';
    }
    if (sourceKey === 'fp') {
      return 'fp';
    }
    if (sourceKey === 'uber') {
      return 'uber';
    }
    return 'unk';
  }

  /**
   * @param {{ sourceKey?: string, number?: string }} item
   * @returns {string}
   */
  function renderIconSlotHtml(item) {
    const sourceKey = item && item.sourceKey ? item.sourceKey : 'store';
    if (!sourceKeyShowsIcon(sourceKey)) {
      return '<span class="milksha-board-icon-slot milksha-board-icon-slot--empty" aria-hidden="true"></span>';
    }
    const src = iconSrcForSourceKey(sourceKey);
    const suffix = iconClassSuffix(sourceKey);
    return (
      '<span class="milksha-board-icon-slot" aria-hidden="true">' +
      '<span class="milksha-board-icon-box">' +
      '<img class="milksha-board-icon milksha-board-icon--' +
      suffix +
      '" src="' +
      src +
      '" alt="" width="100%" height="100%" />' +
      '</span></span>'
    );
  }

  /**
   * @param {{ id?: string, sourceKey?: string, number?: string }} item
   * @returns {string}
   */
  function renderChipInnerHtml(item) {
    if (!item || typeof item.number !== 'string') {
      return '';
    }
    const posNo = QMS.Board && QMS.Board.PosTicketDisplayNo ? QMS.Board.PosTicketDisplayNo : null;
    const escaped =
      posNo && posNo.escapeHtmlText ? posNo.escapeHtmlText(item.number) : String(item.number);
    return renderIconSlotHtml(item) + '<span class="milksha-num">' + escaped + '</span>';
  }

  QMS.Board = QMS.Board || {};
  QMS.Board.SourceIconsLayout = {
    SOURCE_ICON_SRC: SOURCE_ICON_SRC,
    ICON_SOURCE_KEYS: ICON_SOURCE_KEYS,
    sourceKeyShowsIcon: sourceKeyShowsIcon,
    iconSrcForSourceKey: iconSrcForSourceKey,
    renderIconSlotHtml: renderIconSlotHtml,
    renderChipInnerHtml: renderChipInnerHtml,
  };
})(typeof window !== 'undefined' ? window : globalThis);
