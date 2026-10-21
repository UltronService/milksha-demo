import { normalizeBoxReportsForIntakeLog } from './normalize-box-reports';
import type { EntryType, ReceiveLogRecord, ReceiveResult, SourceType, ZoneNumberItem } from './types';

function asZoneBlock(raw: unknown): ReceiveLogRecord['zones']['ready'] {
  const z = (raw ?? {}) as Record<string, unknown>;
  const numbersRaw = Array.isArray(z.numbers) ? z.numbers : [];
  const notShownRaw = Array.isArray(z.notShown) ? z.notShown : [];
  return {
    count: Number(z.count ?? numbersRaw.length),
    numbers: numbersRaw.map((n) => {
      const item = n as Record<string, unknown>;
      const sourceType = item.sourceType as SourceType | undefined;
      return {
        number: String(item.number ?? ''),
        sourceType,
      };
    }),
    notShown: notShownRaw.map((n) => {
      const item = n as Record<string, unknown>;
      return {
        number: String(item.number ?? ''),
        reason: String(item.reason ?? ''),
      };
    }),
  };
}

function stringArrayToNumbers(arr: unknown): ZoneNumberItem[] {
  if (!Array.isArray(arr)) {
    return [];
  }
  return arr.map((n) => ({ number: String(n) }));
}

function zonesFromFeed(r: Record<string, unknown>): ReceiveLogRecord['zones'] {
  const zones = r.zones as Record<string, unknown> | undefined;
  if (zones && (zones.ready || zones.preparing)) {
    return {
      ready: asZoneBlock(zones.ready),
      preparing: asZoneBlock(zones.preparing),
    };
  }
  const readyNumbers = stringArrayToNumbers(r.readyNumbers);
  const preparingNumbers = stringArrayToNumbers(r.preparingNumbers);
  const readyCount =
    r.readyCount === null || r.readyCount === undefined
      ? readyNumbers.length
      : Number(r.readyCount);
  const preparingCount =
    r.preparingCount === null || r.preparingCount === undefined
      ? preparingNumbers.length
      : Number(r.preparingCount);
  return {
    ready: { count: readyCount, numbers: readyNumbers, notShown: [] },
    preparing: { count: preparingCount, numbers: preparingNumbers, notShown: [] },
  };
}

function mapDisposition(disposition: unknown): ReceiveResult {
  const value = String(disposition ?? '').toLowerCase();
  if (value === 'accepted') {
    return 'success';
  }
  if (value === 'rejected') {
    return 'failed';
  }
  return 'skipped';
}

function mapSourceToEntry(source: unknown): EntryType {
  const value = String(source ?? '').toLowerCase();
  if (value.includes('controller')) {
    return 'controller';
  }
  return 'POS';
}

function parseReceivedAtMs(r: Record<string, unknown>): number {
  if (typeof r.receivedAtMs === 'number' && Number.isFinite(r.receivedAtMs)) {
    return r.receivedAtMs;
  }
  const receivedAt = r.receivedAt as { _seconds?: number; _nanoseconds?: number } | undefined;
  if (receivedAt && typeof receivedAt._seconds === 'number') {
    const ms = Math.floor((receivedAt._nanoseconds ?? 0) / 1_000_000);
    return receivedAt._seconds * 1000 + ms;
  }
  return Number(r.receivedAt ?? 0);
}

function buildRawPayload(r: Record<string, unknown>): string {
  if (typeof r.rawPayload === 'string' && r.rawPayload.length > 0) {
    return r.rawPayload;
  }
  return JSON.stringify(
    {
      bodyByteSize: r.bodyByteSize ?? null,
      httpStatus: r.httpStatus ?? null,
      deviceId: r.deviceId ?? null,
      rejectReason: r.rejectReason ?? null,
      requestSignature: '<REDACTED>',
    },
    null,
    2,
  );
}

function rejectedFromFeed(r: Record<string, unknown>): ReceiveLogRecord['rejectedSends'] {
  const legacy = r.rejectedSends ?? r.rejected;
  if (Array.isArray(legacy) && legacy.length > 0) {
    return legacy.map((n) => {
      const item = n as Record<string, unknown>;
      return {
        number: String(item.number ?? '—'),
        reason: String(item.reason ?? ''),
      };
    });
  }
  const reason = r.rejectReason;
  if (reason !== null && reason !== undefined && String(reason).trim() !== '') {
    return [{ number: '—', reason: String(reason) }];
  }
  return [];
}

export function normalizeApiRecord(raw: unknown): ReceiveLogRecord {
  const r = raw as Record<string, unknown>;
  const legacyResult = r.result as ReceiveResult | undefined;
  const result = legacyResult ?? mapDisposition(r.disposition);
  const posSentAtMsRaw = r.posSentAtMs;
  const posSentAtMs =
    posSentAtMsRaw !== null &&
    posSentAtMsRaw !== undefined &&
    typeof posSentAtMsRaw === 'number' &&
    Number.isFinite(posSentAtMsRaw)
      ? posSentAtMsRaw
      : null;
  const posTimeStmpRawRaw = r.posTimeStmpRaw;
  const posTimeStmpRaw =
    posTimeStmpRawRaw === null || posTimeStmpRawRaw === undefined
      ? null
      : String(posTimeStmpRawRaw).slice(0, 64);

  const id = String(r.id ?? '');
  return {
    id,
    receivedAtMs: parseReceivedAtMs(r),
    posTimeStmpRaw,
    posSentAtMs,
    storeNumber: String(r.storeNumber ?? r.storeId ?? ''),
    entry: (r.entry as EntryType | undefined) ?? mapSourceToEntry(r.source),
    sourceIp: String(r.sourceIp ?? r.clientIp ?? ''),
    zones: zonesFromFeed(r),
    result,
    rejectedSends: rejectedFromFeed(r),
    rawPayload: buildRawPayload(r),
    rawPayloadTruncated: Boolean(r.rawPayloadTruncated),
    boxReports: normalizeBoxReportsForIntakeLog(id, r),
  };
}
