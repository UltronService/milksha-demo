/**
 * Stable anonymous box id for box-seen reports (localStorage + URL override).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Board = QMS.Board || {};

  const STORAGE_KEY = 'milksha:boxId';
  const BOX_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

  function readSearchBoxId() {
    try {
      const params = new URLSearchParams(root.location.search);
      const raw = params.get('boxId');
      if (!raw) {
        return '';
      }
      const trimmed = String(raw).trim();
      return BOX_ID_RE.test(trimmed) ? trimmed : '';
    } catch (e) {
      return '';
    }
  }

  function readStoredBoxId() {
    try {
      const storage = root.localStorage;
      if (!storage) {
        return '';
      }
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) {
        return '';
      }
      const trimmed = String(raw).trim();
      return BOX_ID_RE.test(trimmed) ? trimmed : '';
    } catch (e) {
      return '';
    }
  }

  function persistBoxId(boxId) {
    try {
      if (root.localStorage) {
        root.localStorage.setItem(STORAGE_KEY, boxId);
      }
    } catch (e) {
      /* ignore */
    }
  }

  function generateBoxId() {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    const len = 16;
    const out = [];
    if (root.crypto && root.crypto.getRandomValues) {
      const bytes = new Uint8Array(len);
      root.crypto.getRandomValues(bytes);
      for (let i = 0; i < len; i += 1) {
        out.push(alphabet[bytes[i] % alphabet.length]);
      }
    } else {
      for (let j = 0; j < len; j += 1) {
        out.push(alphabet[Math.floor(Math.random() * alphabet.length)]);
      }
    }
    const id = out.join('');
    return BOX_ID_RE.test(id) ? id : id + '_qaBox01';
  }

  /**
   * @returns {{ boxId: string, source: 'url' | 'storage' | 'generated' }}
   */
  function resolveBoxId() {
    const fromUrl = readSearchBoxId();
    if (fromUrl) {
      persistBoxId(fromUrl);
      return { boxId: fromUrl, source: 'url' };
    }
    const stored = readStoredBoxId();
    if (stored) {
      return { boxId: stored, source: 'storage' };
    }
    const generated = generateBoxId();
    persistBoxId(generated);
    return { boxId: generated, source: 'generated' };
  }

  QMS.Board.resolveBoxId = resolveBoxId;
  QMS.Board.BOX_ID_PATTERN = BOX_ID_RE;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
