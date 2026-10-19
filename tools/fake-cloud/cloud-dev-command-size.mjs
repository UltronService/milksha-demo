/** Cloud-side devCommand size limits (milksha-cloud PR #38; not enforced on controller). */
export const PUSH_NUMBERS_MAX_PARAMS_BYTES = 256 * 1024;
export const NON_PUSH_DEV_COMMAND_MAX_BYTES = 1024;

export const API_ERROR_PUSH_NUMBERS_PARAMS_TOO_LARGE = 'push_numbers_params_too_large';

function utf8ByteLength(text) {
  return Buffer.byteLength(String(text), 'utf8');
}

/**
 * @param {{ type?: string, params?: unknown, storeId?: string, deviceId?: string }} body validated devCommand body
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function cloudDevCommandSizeCheck(body) {
  const type = String(body && body.type ? body.type : '').trim();
  if (type === 'push_numbers') {
    const paramsJson = JSON.stringify(body.params || {});
    if (utf8ByteLength(paramsJson) > PUSH_NUMBERS_MAX_PARAMS_BYTES) {
      return {
        ok: false,
        code: API_ERROR_PUSH_NUMBERS_PARAMS_TOO_LARGE,
        message: 'push_numbers params exceed max size',
      };
    }
    return { ok: true };
  }
  const json = JSON.stringify(body);
  if (utf8ByteLength(json) > NON_PUSH_DEV_COMMAND_MAX_BYTES) {
    return {
      ok: false,
      code: 'invalid_command_params',
      message: 'command exceeds 1024 byte limit',
    };
  }
  return { ok: true };
}
