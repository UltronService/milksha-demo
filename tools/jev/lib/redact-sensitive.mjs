const EMAIL_RE =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const GH_TOKEN_RE = /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g;
const LONG_HEX_RE = /\b[0-9a-fA-F]{32,}\b/g;
const AWS_KEY_RE = /\bAKIA[0-9A-Z]{16}\b/g;
const SECRET_ASSIGN_RE =
  /((?:api[_-]?key|secret|token|password)\s*[:=]\s*)([^\s<>'"]+)/gi;

/**
 * @param {string} text
 * @returns {string}
 */
export function redactSensitive(text) {
  if (!text) {
    return text;
  }
  let out = text.replaceAll('<REDACTED>', '⟦REDACTED⟧');
  out = out.replace(
    /Authorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    'Authorization: Bearer <REDACTED>',
  );
  out = out.replace(EMAIL_RE, '<REDACTED>');
  out = out.replace(BEARER_RE, 'Bearer <REDACTED>');
  out = out.replace(GH_TOKEN_RE, '<REDACTED>');
  out = out.replace(AWS_KEY_RE, '<REDACTED>');
  out = out.replace(LONG_HEX_RE, '<REDACTED>');
  out = out.replace(
    SECRET_ASSIGN_RE,
    (_m, prefix) => `${prefix}<REDACTED>`,
  );
  return out.replaceAll('⟦REDACTED⟧', '<REDACTED>');
}
