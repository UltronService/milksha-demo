import { resolveApiBaseUrl } from './config';
import { normalizeApiRecord } from './normalize-api-record';
import type { FetchReceiveLogsParams, ReceiveLogsApiResponse } from './types';
import { DEFAULT_FETCH_LIMIT, MAX_FETCH_LIMIT } from './types';

export class FetchReceiveLogsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchReceiveLogsError';
  }
}

function clampLimit(limit?: number): number {
  const value = limit ?? DEFAULT_FETCH_LIMIT;
  if (value < 1) {
    return DEFAULT_FETCH_LIMIT;
  }
  return Math.min(value, MAX_FETCH_LIMIT);
}

export async function fetchReceiveLogs(
  params: FetchReceiveLogsParams,
  apiBaseOverride?: string,
): Promise<ReceiveLogsApiResponse> {
  const base = (apiBaseOverride ?? resolveApiBaseUrl()).replace(/\/$/, '');
  if (!base) {
    throw new FetchReceiveLogsError('未設定 API base URL（config 或 ?apiBase=）');
  }
  const url = new URL(base);
  const storeId = params.storeId.trim();
  if (storeId) {
    url.searchParams.set('storeId', storeId);
  }
  url.searchParams.set('limit', String(clampLimit(params.limit)));

  try {
    const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      throw new FetchReceiveLogsError(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { status: string; records?: unknown[] };
    if (body.status === '已停用') {
      return { status: '已停用' };
    }
    if (body.status !== 'ok' || !Array.isArray(body.records)) {
      throw new FetchReceiveLogsError('回應格式錯誤');
    }
    const records = body.records.map(normalizeApiRecord);
    records.sort((a, b) => b.receivedAtMs - a.receivedAtMs);
    return { status: 'ok', records };
  } catch (e) {
    if (e instanceof FetchReceiveLogsError) {
      throw e;
    }
    const message = e instanceof Error ? e.message : 'fetch failed';
    throw new FetchReceiveLogsError(message);
  }
}
