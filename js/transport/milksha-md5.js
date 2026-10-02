/**
 * MD5 hex via blueimp md5 (js/vendor/md5.min.js).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  function md5Hex(text) {
    if (typeof root.md5 === 'function') {
      return root.md5(text);
    }
    if (typeof root.require === 'function') {
      try {
        const crypto = root.require('crypto');
        return crypto.createHash('md5').update(text, 'utf8').digest('hex');
      } catch (e) {
        /* ignore */
      }
    }
    throw new Error('MD5 not available: load js/vendor/md5.min.js');
  }

  QMS.Transport.MilkshaMd5 = { md5Hex: md5Hex };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
