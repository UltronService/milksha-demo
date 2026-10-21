export interface BoxReportFieldKeys {
  intakeLogId: string;
  boxCode: string;
  ip: string;
  delayMs: string;
  lateSeconds: string;
  clockSynced: string;
}

/** Assumed milksha-cloud feed field names until backend PR lands. */
export const DEFAULT_BOX_REPORT_FIELD_KEYS: BoxReportFieldKeys = {
  intakeLogId: 'intakeLogId',
  boxCode: 'boxId',
  ip: 'ip',
  delayMs: 'delayMs',
  lateSeconds: 'lateSeconds',
  clockSynced: 'clockSynced',
};

export const DEFAULT_BOX_REPORTS_LIST_KEY = 'boxReports';

import type { BoardBoxReportRow } from './types';

function readDelayMs(item: Record<string, unknown>, keys: BoxReportFieldKeys): number | null {
  const delayRaw = item[keys.delayMs];
  if (typeof delayRaw === 'number' && Number.isFinite(delayRaw)) {
    return delayRaw;
  }
  const lateRaw = item[keys.lateSeconds];
  if (typeof lateRaw === 'number' && Number.isFinite(lateRaw)) {
    return lateRaw * 1000;
  }
  return null;
}

function readClockStatus(item: Record<string, unknown>, keys: BoxReportFieldKeys): string {
  const synced = item[keys.clockSynced];
  if (synced === true) {
    return '已校正';
  }
  return '未校正';
}

function normalizeOneRow(
  item: Record<string, unknown>,
  keys: BoxReportFieldKeys,
): BoardBoxReportRow {
  const boxCodeRaw = item[keys.boxCode];
  const ipRaw = item[keys.ip];
  return {
    boxCode: boxCodeRaw === null || boxCodeRaw === undefined ? '' : String(boxCodeRaw),
    ip: ipRaw === null || ipRaw === undefined ? '' : String(ipRaw),
    delayMs: readDelayMs(item, keys),
    clockStatus: readClockStatus(item, keys),
  };
}

export interface NormalizeBoxReportsOptions {
  listKey?: string;
  fieldKeys?: BoxReportFieldKeys;
}

export function normalizeBoxReportsForIntakeLog(
  intakeLogId: string,
  rawRecord: unknown,
  options: NormalizeBoxReportsOptions = {},
): BoardBoxReportRow[] {
  const listKey = options.listKey ?? DEFAULT_BOX_REPORTS_LIST_KEY;
  const keys = options.fieldKeys ?? DEFAULT_BOX_REPORT_FIELD_KEYS;
  const record = (rawRecord ?? {}) as Record<string, unknown>;
  const listRaw = record[listKey];
  if (!Array.isArray(listRaw) || listRaw.length === 0) {
    return [];
  }

  const targetId = String(intakeLogId);
  const rows: BoardBoxReportRow[] = [];
  for (const entry of listRaw) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const rowIntakeId = item[keys.intakeLogId];
    if (rowIntakeId !== null && rowIntakeId !== undefined && String(rowIntakeId) !== targetId) {
      continue;
    }
    rows.push(normalizeOneRow(item, keys));
  }
  return rows;
}
