/** Delay display for box reports (seconds, PR #48 / #112 group 5). */

export function formatDelaySecondsDisplay(delaySec: number | null | undefined): string {
  if (delaySec === null || delaySec === undefined) {
    return '';
  }
  const n = Number(delaySec);
  if (!Number.isFinite(n)) {
    return '';
  }
  return n.toFixed(3);
}

export function formatDelaySecondsCell(delaySec: number | null | undefined): string {
  const sec = formatDelaySecondsDisplay(delaySec);
  if (!sec) {
    return '';
  }
  const asNum = Number(sec);
  if (asNum < 0) {
    return `${sec} 兩邊時鐘不同`;
  }
  return sec;
}
