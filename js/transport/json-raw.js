/**
 * Extract a JSON value substring from raw request text (byte-identical inner JSON for MD5).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  function skipWs(s, i) {
    while (i < s.length && (s[i] === ' ' || s[i] === '\n' || s[i] === '\r' || s[i] === '\t')) {
      i += 1;
    }
    return i;
  }

  function readString(s, start) {
    if (s[start] !== '"') {
      return null;
    }
    let i = start + 1;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '"') {
        return { text: s.slice(start, i + 1), end: i + 1 };
      }
      i += 1;
    }
    return null;
  }

  function readPrimitive(s, start) {
    const m = /^(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(s.slice(start));
    if (!m) {
      return null;
    }
    return { text: m[1], end: start + m[1].length };
  }

  function readCompound(s, start) {
    const open = s[start];
    if (open !== '{' && open !== '[') {
      return null;
    }
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i += 1) {
      const ch = s[i];
      if (inStr) {
        if (esc) {
          esc = false;
          continue;
        }
        if (ch === '\\') {
          esc = true;
          continue;
        }
        if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === open) {
        depth += 1;
        continue;
      }
      if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          return { text: s.slice(start, i + 1), end: i + 1 };
        }
      }
    }
    return null;
  }

  function readJsonValue(s, start) {
    const i = skipWs(s, start);
    if (i >= s.length) {
      return null;
    }
    const ch = s[i];
    if (ch === '"') {
      return readString(s, i);
    }
    if (ch === '{' || ch === '[') {
      return readCompound(s, i);
    }
    return readPrimitive(s, i);
  }

  /**
   * @param {string} bodyText full HTTP JSON body
   * @param {string} fieldName e.g. serviceSpecialData_Json
   * @returns {string|null} raw JSON text of the value (includes quotes for strings)
   */
  function extractRawJsonField(bodyText, fieldName) {
    if (!bodyText || !fieldName) {
      return null;
    }
    const key = '"' + fieldName + '"';
    const idx = bodyText.indexOf(key);
    if (idx < 0) {
      return null;
    }
    let i = skipWs(bodyText, idx + key.length);
    if (bodyText[i] !== ':') {
      return null;
    }
    i = skipWs(bodyText, i + 1);
    const val = readJsonValue(bodyText, i);
    return val ? val.text : null;
  }

  QMS.Transport.JsonRaw = {
    extractRawJsonField: extractRawJsonField,
    readJsonValue: readJsonValue,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
