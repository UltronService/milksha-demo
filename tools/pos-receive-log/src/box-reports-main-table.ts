import type { SortOrder } from 'antd/es/table/interface';
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

function isDashValue(value: BoxReportsMainCellValue): boolean {
  return value === 'dash';
}

/** Ant Design negates compare on descend; bias keeps dash rows last in both directions. */
function compareDashVsNumber(
  aIsDash: boolean,
  bIsDash: boolean,
  sortOrder?: SortOrder,
): number | null {
  if (aIsDash && bIsDash) {
    return 0;
  }
  if (aIsDash) {
    return sortOrder === 'descend' ? -1 : 1;
  }
  if (bIsDash) {
    return sortOrder === 'descend' ? 1 : -1;
  }
  return null;
}

function compareMainTableMetric(
  a: ReceiveLogRecordForSort,
  b: ReceiveLogRecordForSort,
  pick: (metrics: BoxReportsMainTableMetrics) => BoxReportsMainCellValue,
  sortOrder?: SortOrder,
): number {
  const aVal = pick(computeBoxReportsMainTableMetrics(a.boxReportsFeedShape, a.boxReports));
  const bVal = pick(computeBoxReportsMainTableMetrics(b.boxReportsFeedShape, b.boxReports));
  const dashCmp = compareDashVsNumber(isDashValue(aVal), isDashValue(bVal), sortOrder);
  if (dashCmp !== null) {
    return dashCmp;
  }
  return (aVal as number) - (bVal as number);
}

export function compareBoxCount(
  a: ReceiveLogRecordForSort,
  b: ReceiveLogRecordForSort,
  sortOrder?: SortOrder,
): number {
  return compareMainTableMetric(a, b, (m) => m.boxCount, sortOrder);
}

export function compareNotReportedCount(
  a: ReceiveLogRecordForSort,
  b: ReceiveLogRecordForSort,
  sortOrder?: SortOrder,
): number {
  return compareMainTableMetric(a, b, (m) => m.notReportedCount, sortOrder);
}

export interface ReceiveLogRecordForSort {
  boxReportsFeedShape: BoxReportsFeedShape;
  boxReports: BoardBoxReportRow[];
}
