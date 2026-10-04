/** Asia/Taipei business day (rolls at 03:00), aligned with js/board/today-board.js */

export function taipeiCalendarDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${day}`;
}

function addCalendarDays(ymd, delta) {
  const [y, mo, da] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function taipeiHourMinute(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === 'hour');
  const m = parts.find((p) => p.type === 'minute');
  return { hour: Number(h?.value ?? 0), minute: Number(m?.value ?? 0) };
}

export function taipeiBusinessDate(d = new Date()) {
  const cal = taipeiCalendarDate(d);
  const hm = taipeiHourMinute(d);
  if (hm.hour < 3) {
    return addCalendarDays(cal, -1);
  }
  return cal;
}

export function isCurrentBusinessDate(businessDate, d = new Date()) {
  if (!businessDate) return false;
  return String(businessDate) === taipeiBusinessDate(d);
}
