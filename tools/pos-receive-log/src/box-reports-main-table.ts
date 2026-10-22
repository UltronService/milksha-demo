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

export function compareNotReportedCount(a: ReceiveLogRecordForSort, b: ReceiveLogRecordForSort): number {
  const av = sortKeyForNotReported(a);
  const bv = sortKeyForNotReported(b);
  return av - bv;
}

export interface ReceiveLogRecordForSort {
  boxReportsFeedShape: BoxReportsFeedShape;
  boxReports: BoardBoxReportRow[];
}

function sortKeyForNotReported(record: ReceiveLogRecordForSort): number {
  const metrics = computeBoxReportsMainTableMetrics(record.boxReportsFeedShape, record.boxReports);
  if (metrics.notReportedCount === 'dash') {
    return -1;
  }
  return metrics.notReportedCount;
}
