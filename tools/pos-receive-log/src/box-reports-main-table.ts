import type { BoardBoxReportRow, BoxReportsFeedShape } from './types';

export type BoxReportsMainCellValue = number | 'dash';

export interface BoxReportsMainTableMetrics {
  boxCount: BoxReportsMainCellValue;
  notReportedCount: BoxReportsMainCellValue;
}

export function readBoxReportsFeedShape(rawRecord: Record<string, unknown>, listKey = 'boxReports'): BoxReportsFeedShape {
  if (!Object.prototype.hasOwnProperty.call(rawRecord, listKey)) {
    return 'missing';
  }
  const listRaw = rawRecord[listKey];
  if (!Array.isArray(listRaw)) {
    return 'invalid';
  }
  return 'array';
}

export function countNotReportedBoxes(rows: BoardBoxReportRow[]): number {
  return rows.filter(
    (row) =>
      row.status === 'not_reported' ||
      (row.status === null && row.hasUnknownStatus !== true),
  ).length;
}

export function computeBoxReportsMainTableMetrics(
  feedShape: BoxReportsFeedShape,
  rows: BoardBoxReportRow[],
): BoxReportsMainTableMetrics {
  if (feedShape === 'missing' || feedShape === 'invalid') {
    return { boxCount: 'dash', notReportedCount: 'dash' };
  }
  return {
    boxCount: rows.length,
    notReportedCount: countNotReportedBoxes(rows),
  };
}

export function formatMainTableCountCell(value: BoxReportsMainCellValue): string {
  if (value === 'dash') {
    return '—';
  }
  return String(value);
}

/** Dash rows sort after all numeric values when ascending. */
const DASH_SORT_RANK = Number.MAX_SAFE_INTEGER;

export function sortKeyForMainTableCount(value: BoxReportsMainCellValue): number {
  if (value === 'dash') {
    return DASH_SORT_RANK;
  }
  return value;
}

export function compareBoxCount(a: ReceiveLogRecordForSort, b: ReceiveLogRecordForSort): number {
  const av = sortKeyForMainTableCount(
    computeBoxReportsMainTableMetrics(a.boxReportsFeedShape, a.boxReports).boxCount,
  );
  const bv = sortKeyForMainTableCount(
    computeBoxReportsMainTableMetrics(b.boxReportsFeedShape, b.boxReports).boxCount,
  );
  return av - bv;
}

export function compareNotReportedCount(a: ReceiveLogRecordForSort, b: ReceiveLogRecordForSort): number {
  const av = sortKeyForMainTableCount(
    computeBoxReportsMainTableMetrics(a.boxReportsFeedShape, a.boxReports).notReportedCount,
  );
  const bv = sortKeyForMainTableCount(
    computeBoxReportsMainTableMetrics(b.boxReportsFeedShape, b.boxReports).notReportedCount,
  );
  return av - bv;
}

export interface ReceiveLogRecordForSort {
  boxReportsFeedShape: BoxReportsFeedShape;
  boxReports: BoardBoxReportRow[];
}
