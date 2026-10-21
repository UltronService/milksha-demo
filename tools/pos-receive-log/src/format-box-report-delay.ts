/** Aligned with js/tools/pos-receive-log-format.js on cursor/box-seen-report (#112 group 5). */

export function formatReceiveDelaySecondsFromMs(delayMs: number | null | undefined): string {
  if (delayMs === null || delayMs === undefined) {
    return '';
  }
  const n = Number(delayMs);
  if (!Number.isFinite(n)) {
    return '';
  }
  return (n / 1000).toFixed(3);
}

export function formatReceiveDelayCell(delayMs: number | null | undefined): string {
  const sec = formatReceiveDelaySecondsFromMs(delayMs);
  if (!sec) {
    return '';
  }
  const asNum = Number(sec);
  if (asNum < 0) {
    return `${sec} 兩邊時鐘不同`;
  }
  return sec;
}
