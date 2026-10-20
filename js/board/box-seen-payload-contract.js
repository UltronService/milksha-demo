/**
 * boxSeenReport item time fields — must match milksha-cloud (PR #43/#44); no "At" in names.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  /** @type {readonly string[]} */
  const BOX_SEEN_ITEM_TIME_FIELD_NAMES = [
    'firstDataLocalMs',
    'firstPaintLocalMs',
    'firstDataCorrectedMs',
    'firstPaintCorrectedMs',
  ];

  QMS.Board.BOX_SEEN_ITEM_TIME_FIELD_NAMES = BOX_SEEN_ITEM_TIME_FIELD_NAMES;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
