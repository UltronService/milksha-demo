import { resolveApiBaseUrl } from './config';
import type { FetchReceiveLogsParams, ReceiveLogsApiResponse } from './types';

export class FetchReceiveLogsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchReceiveLogsError';
  }
}

export async function fetchReceiveLogs(
  params: FetchReceiveLogsParams,
  apiBaseOverride?: string,
): Promise<ReceiveLogsApiResponse> {
  const base = (apiBaseOverride ?? resolveApiBaseUrl()).replace(/\/$/, '');
  if (!base) {
    throw new FetchReceiveLogsError('未設定 API base URL（config 或 ?apiBase=）');
  }
  const url = new URL(`${base}/pos-receive-logs`);
  url.searchParams.set('storeNumber', params.storeNumber);
  url.searchParams.set('fromMs', String(params.fromMs));
  url.searchParams.set('toMs', String(params.toMs));

  try {
    const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      throw new FetchReceiveLogsError(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as ReceiveLogsApiResponse;
    return body;
  } catch (e) {
    if (e instanceof FetchReceiveLogsError) {
      throw e;
    }
    const message = e instanceof Error ? e.message : 'fetch failed';
    throw new FetchReceiveLogsError(message);
  }
}
