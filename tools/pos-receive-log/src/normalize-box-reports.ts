import type { BoardBoxReportRow, BoxReportStatus } from './types';

export interface BoxReportFieldKeys {
  boxId: string;
  ip: string;
  status: string;
  delay: string;
  clockSynced: string;
  clockOffsetMs: string;
}

/** milksha-cloud PR #48 (da36b4b) feed field names. */
export const DEFAULT_BOX_REPORT_FIELD_KEYS: BoxReportFieldKeys = {
  boxId: 'boxId',
  ip: 'ip',
  status: 'status',
  delay: 'delay',
  clockSynced: 'clockSynced',
  clockOffsetMs: 'clockOffsetMs',
};

export const DEFAULT_BOX_REPORTS_LIST_KEY = 'boxReports';

function readStatus(raw: unknown): BoxReportStatus | null {
  if (raw === 'reported' || raw === 'not_reported') {
    return raw;
  }
  return null;
}

function readDelaySec(item: Record<string, unknown>, keys: BoxReportFieldKeys): number | null {
  const delayRaw = item[keys.delay];
  if (delayRaw === null || delayRaw === undefined) {
    return null;
  }
  const n = Number(delayRaw);
  if (!Number.isFinite(n)) {
    return null;
  }
  return n;
}

function readClockSynced(item: Record<string, unknown>, keys: BoxReportFieldKeys): boolean | null {
  const synced = item[keys.clockSynced];
  if (synced === true) {
    return true;
  }
  if (synced === false) {
    return false;
  }
  return null;
}

function readClockOffsetMs(item: Record<string, unknown>, keys: BoxReportFieldKeys): number | null {
  const raw = item[keys.clockOffsetMs];
  if (raw === null || raw === undefined) {
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return null;
  }
  return n;
}

function normalizeOneRow(
  item: Record<string, unknown>,
  keys: BoxReportFieldKeys,
): BoardBoxReportRow {
  const status = readStatus(item[keys.status]);
  const boxIdRaw = item[keys.boxId];
  const ipRaw = item[keys.ip];
  const delaySec = status === 'not_reported' ? null : readDelaySec(item, keys);
  const clockSynced = status === 'not_reported' ? null : readClockSynced(item, keys);
  const clockOffsetMs = status === 'not_reported' ? null : readClockOffsetMs(item, keys);

  return {
    boxId: boxIdRaw === null || boxIdRaw === undefined ? '' : String(boxIdRaw),
    ip: ipRaw === null || ipRaw === undefined ? '' : String(ipRaw),
    status,
    delaySec,
    clockSynced,
    clockOffsetMs,
  };
}

export interface NormalizeBoxReportsOptions {
  listKey?: string;
  fieldKeys?: BoxReportFieldKeys;
}

export function normalizeBoxReportsForIntakeLog(
  _intakeLogId: string,
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

  const rows: BoardBoxReportRow[] = [];
  for (const entry of listRaw) {
    const item = (entry ?? {}) as Record<string, unknown>;
    rows.push(normalizeOneRow(item, keys));
  }
  return rows;
}
