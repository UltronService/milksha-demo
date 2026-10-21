import { formatTaipeiWithMs } from './format-taipei-time';

export interface ProcessingDurationDisplay {
  text: string;
  clockSkew: boolean;
}

export function formatSentTimeCell(
  posSentAtMs: number | null | undefined,
  posTimeStmpRaw: string | null | undefined,
): string {
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
