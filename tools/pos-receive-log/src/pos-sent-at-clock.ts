export const POS_SENT_AT_MAX_SKEW_MS = 10000;

export function isWithinPosSentAtSkew(deviceSentAtMs: number, cloudReceivedAtMs: number): boolean {
  const deviceMs = Math.floor(deviceSentAtMs);
  const cloudMs = Math.floor(cloudReceivedAtMs);
  if (!Number.isFinite(deviceMs) || !Number.isFinite(cloudMs)) {
    return false;
  }
  return Math.abs(cloudMs - deviceMs) <= POS_SENT_AT_MAX_SKEW_MS;
}

/**
 * Mirrors milksha-cloud intake: explicit API flag wins; else derive from timestamps.
 */
export function resolvePosSentAtIgnored(
  receivedAtMs: number,
  posSentAtMs: number | null | undefined,
  apiFlag: boolean | null | undefined,
): boolean {
  if (apiFlag === true) {
    return true;
  }
  if (apiFlag === false) {
    return false;
  }
  if (posSentAtMs === null || posSentAtMs === undefined || !Number.isFinite(posSentAtMs)) {
    return false;
  }
  return !isWithinPosSentAtSkew(posSentAtMs, receivedAtMs);
}
