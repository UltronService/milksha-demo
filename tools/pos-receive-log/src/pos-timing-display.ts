import { formatTaipeiWithMs } from './format-taipei-time';
import { resolvePosSentAtIgnored } from './pos-sent-at-clock';

export interface ProcessingDurationDisplay {
  text: string;
  clockSkew: boolean;
}

export function formatSentTimeCell(
  posSentAtMs: number | null | undefined,
  posTimeStmpRaw: string | null | undefined,
  posSentAtIgnored?: boolean | null,
  receivedAtMs?: number,
): string {
  const ignored =
    receivedAtMs !== undefined && Number.isFinite(receivedAtMs)
      ? resolvePosSentAtIgnored(receivedAtMs, posSentAtMs, posSentAtIgnored)
      : posSentAtIgnored === true;
  if (ignored) {
    return '時間異常';
  }
  if (posSentAtMs !== null && posSentAtMs !== undefined && Number.isFinite(posSentAtMs)) {
    return formatTaipeiWithMs(posSentAtMs);
  }
  if (posTimeStmpRaw !== null && posTimeStmpRaw !== undefined && String(posTimeStmpRaw).trim() !== '') {
    return '格式錯誤';
  }
  return '—';
}

export function formatProcessingDuration(
  receivedAtMs: number,
  posSentAtMs: number | null | undefined,
): ProcessingDurationDisplay {
  if (posSentAtMs === null || posSentAtMs === undefined || !Number.isFinite(posSentAtMs)) {
    return { text: '—', clockSkew: false };
  }
  const seconds = (receivedAtMs - posSentAtMs) / 1000;
  return {
    text: seconds.toFixed(3),
    clockSkew: seconds < 0,
  };
}
