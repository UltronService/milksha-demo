/**
 * boxSeenReport item time fields — milksha-cloud PR #45 (names include "At").
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  /** @type {readonly string[]} */
  const BOX_SEEN_ITEM_TIME_FIELD_NAMES = [
    'firstDataAtLocalMs',
    'firstPaintAtLocalMs',
    'firstDataAtCorrectedMs',
    'firstPaintAtCorrectedMs',
  ];

  QMS.Board.BOX_SEEN_ITEM_TIME_FIELD_NAMES = BOX_SEEN_ITEM_TIME_FIELD_NAMES;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
