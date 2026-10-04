import crypto from 'node:crypto';

export const ENTRY_A_OFF_MSG = '入口 A 未啟用';
export const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

export function milkshaTargetForAccount(account) {
  return 'milksha' + String(account || '');
}

export function md5Hex(text) {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

export function parseTimeStmp(ts) {
  if (!ts || typeof ts !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2}):(\d{1,4})$/.exec(ts);
  if (!m) return null;
  const fracNum = Number(m[7]);
  if (!Number.isFinite(fracNum) || fracNum < 0 || fracNum > 9999) return null;
  const ms = fracNum <= 999 ? fracNum : fracNum % 1000;
  const y = m[1];
  const mo = m[2];
  const da = m[3];
  const h = m[4];
  const mi = m[5];
  const s = m[6];
  const ms3 = String(ms).padStart(3, '0');
  return new Date(`${y}-${mo}-${da}T${h}:${mi}:${s}.${ms3}+08:00`);
}

export function validatePosReceiverBody(body, opts = {}) {
  const now = opts.now || new Date();
  const maxAgeMs = typeof opts.maxAgeMs === 'number' ? opts.maxAgeMs : DEFAULT_MAX_AGE_MS;
  if (opts.entryAEnabled === false) {
    return { ok: false, information: ENTRY_A_OFF_MSG };
  }
  if (!body?.serviceSpecialData_Json) {
    return { ok: false, information: '叫號資料格式錯誤' };
  }
  const rawInner =
    typeof opts.serviceSpecialDataJsonRaw === 'string' ? opts.serviceSpecialDataJsonRaw : null;
  const jsonStr = rawInner !== null ? rawInner : JSON.stringify(body.serviceSpecialData_Json);
  const expectedHash = md5Hex(jsonStr);
  if (!body.serviceSpecialData_Json_Md5Hash || body.serviceSpecialData_Json_Md5Hash !== expectedHash) {
    return { ok: false, information: 'Md5Hash 不符' };
  }
  const parsed = parseTimeStmp(body.timeStmp);
  if (!parsed) {
    return { ok: false, information: 'timeStmp 格式錯誤' };
  }
  const age = now.getTime() - parsed.getTime();
  if (age > maxAgeMs || age < -60000) {
    return { ok: false, information: 'timeStmp 已過期' };
  }
  const account = String(body.account || '');
  const target = body.serviceSpecialData_Json.target || '';
  if (target !== milkshaTargetForAccount(account)) {
    return { ok: false, information: '找不到目標叫號機' };
  }
  return { ok: true, information: '' };
}
