export const POS_SENT_AT_MAX_SKEW_MS = 10000;

export function isWithinPosSentAtSkew(deviceSentAtMs, cloudNowMs) {
  const deviceMs = Math.floor(Number(deviceSentAtMs));
  const cloudMs = Math.floor(Number(cloudNowMs));
  if (!Number.isFinite(deviceMs) || !Number.isFinite(cloudMs)) {
    return false;
  }
  return Math.abs(cloudMs - deviceMs) <= POS_SENT_AT_MAX_SKEW_MS;
}

export function evaluatePosSentAtClock(sentAtMs, cloudNowMs) {
  if (sentAtMs === undefined || sentAtMs === null) {
    return { posSentAtMs: null, posSentAtIgnored: false };
  }
  const deviceMs = Math.floor(Number(sentAtMs));
  if (!Number.isFinite(deviceMs) || deviceMs < 0) {
    return { posSentAtMs: null, posSentAtIgnored: false };
  }
  if (isWithinPosSentAtSkew(deviceMs, cloudNowMs)) {
    return { posSentAtMs: deviceMs, posSentAtIgnored: false };
  }
  return { posSentAtMs: null, posSentAtIgnored: true };
}
