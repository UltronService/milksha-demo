const taipeiFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Taipei',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Wall-clock ms within the current second in Asia/Taipei (0–999). */
function taipeiMilliseconds(epochMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).formatToParts(new Date(epochMs));
  const frac = parts.find((p) => p.type === 'fractionalSecond');
  if (frac?.value) {
    return Number(frac.value.padEnd(3, '0'));
  }
  return epochMs % 1000;
}

export function formatTaipeiWithMs(epochMs: number): string {
  const base = taipeiFormatter.format(epochMs);
  const ms = String(taipeiMilliseconds(epochMs)).padStart(3, '0');
  return `${base}.${ms}`;
}
