import type { ReceiveLogRecord, ReceiveResult, SourceType } from './types';

function asZoneBlock(raw: unknown): ReceiveLogRecord['zones']['ready'] {
  const z = (raw ?? {}) as Record<string, unknown>;
  const numbersRaw = Array.isArray(z.numbers) ? z.numbers : [];
  const notShownRaw = Array.isArray(z.notShown) ? z.notShown : [];
  return {
    count: Number(z.count ?? numbersRaw.length),
    numbers: numbersRaw.map((n) => {
      const item = n as Record<string, unknown>;
      return {
        number: String(item.number ?? ''),
        sourceType: item.sourceType as SourceType,
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

function asRejected(raw: unknown): ReceiveLogRecord['rejectedSends'] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((n) => {
    const item = n as Record<string, unknown>;
    return {
      number: String(item.number ?? ''),
      reason: String(item.reason ?? ''),
    };
  });
}

export function normalizeApiRecord(raw: unknown): ReceiveLogRecord {
  const r = raw as Record<string, unknown>;
  const receivedAtMs = Number(r.receivedAtMs ?? r.receivedAt);
  const storeNumber = String(r.storeNumber ?? r.storeId ?? '');
  const rejected = r.rejectedSends ?? r.rejected ?? [];
  const zones = (r.zones ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    receivedAtMs,
    storeNumber,
    entry: r.entry as ReceiveLogRecord['entry'],
    sourceIp: String(r.sourceIp ?? ''),
    zones: {
      ready: asZoneBlock(zones.ready),
      preparing: asZoneBlock(zones.preparing),
    },
    result: r.result as ReceiveResult,
    rejectedSends: asRejected(rejected),
    rawPayload: String(r.rawPayload ?? ''),
    rawPayloadTruncated: Boolean(r.rawPayloadTruncated),
  };
}
