/**
 * Firestore REST typed value encode/decode.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  /**
   * @param {unknown} value
   * @returns {object | null}
   */
  function encodeValue(value) {
    if (value === null || value === undefined) {
      return { nullValue: null };
    }
    if (typeof value === 'string') {
      return { stringValue: value };
    }
    if (typeof value === 'boolean') {
      return { booleanValue: value };
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        return { doubleValue: value };
      }
      return { integerValue: String(value) };
    }
    if (value instanceof Date) {
      return { timestampValue: value.toISOString() };
    }
    if (Array.isArray(value)) {
      return {
        arrayValue: {
          values: value.map(function (v) {
            return encodeValue(v);
          }),
        },
      };
    }
    if (typeof value === 'object') {
      const fields = {};
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i += 1) {
        const k = keys[i];
        fields[k] = encodeValue(value[k]);
      }
      return { mapValue: { fields: fields } };
    }
    return { stringValue: String(value) };
  }

  /**
   * @param {object | undefined} wrapped
   * @returns {unknown}
   */
  function decodeValue(wrapped) {
    if (!wrapped || typeof wrapped !== 'object') {
      return null;
    }
    if ('nullValue' in wrapped) {
      return null;
    }
    if ('stringValue' in wrapped) {
      return wrapped.stringValue;
    }
    if ('booleanValue' in wrapped) {
      return wrapped.booleanValue;
    }
    if ('integerValue' in wrapped) {
      return parseInt(wrapped.integerValue, 10);
    }
    if ('doubleValue' in wrapped) {
      return wrapped.doubleValue;
    }
    if ('timestampValue' in wrapped) {
      return wrapped.timestampValue;
    }
    if (wrapped.arrayValue && Array.isArray(wrapped.arrayValue.values)) {
      return wrapped.arrayValue.values.map(decodeValue);
    }
    if (wrapped.mapValue && wrapped.mapValue.fields) {
      const out = {};
      const f = wrapped.mapValue.fields;
      const keys = Object.keys(f);
      for (let i = 0; i < keys.length; i += 1) {
        out[keys[i]] = decodeValue(f[keys[i]]);
      }
      return out;
    }
    return null;
  }

  /**
   * @param {object} fields document.fields from Firestore REST
   * @returns {Record<string, unknown>}
   */
  function decodeDocumentFields(fields) {
    const out = {};
    if (!fields) {
      return out;
    }
    const keys = Object.keys(fields);
    for (let i = 0; i < keys.length; i += 1) {
      out[keys[i]] = decodeValue(fields[keys[i]]);
    }
    return out;
  }

  /**
   * @param {Record<string, unknown>} obj
   * @returns {{ fields: Record<string, object> }}
   */
  function encodeDocumentFields(obj) {
    const fields = {};
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i += 1) {
      fields[keys[i]] = encodeValue(obj[keys[i]]);
    }
    return { fields: fields };
  }

  QMS.Transport.FirestoreValue = {
    encodeValue: encodeValue,
    decodeValue: decodeValue,
    decodeDocumentFields: decodeDocumentFields,
    encodeDocumentFields: encodeDocumentFields,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
