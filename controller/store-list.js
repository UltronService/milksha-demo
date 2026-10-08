/**
 * Cloud store picker: listStores client, sorting, test-store filter, store-id validation.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Controller = QMS.Controller || {};

  const STORE_LIST_POLL_MS = 30000;
  const ONLINE_WINDOW_SEC_DEFAULT = 180;

  const MSG_STORE_ID_INVALID = '店號格式不對';
  const MSG_STORE_NOT_REGISTERED =
    '這家店還沒有看板連線過，請先打開看板';
  const MSG_REGISTRY_FULL = '測試店登記名額已滿，請聯絡後端';

  const KNOWN_LITERAL_STORE_IDS = new Set(['s120030', 'c030020']);
  const STORE_ID_ZZ_QA_RE = /^zz-qa-[a-z0-9-]+$/;
  const STORE_ID_ZZ_DENY_RE = /^zz-deny-[a-z0-9-]+$/;
  const STORE_ID_LETTER_SIX_DIGITS_RE = /^[a-z][0-9]{6}$/;

  /**
   * @param {string} storeId
   * @returns {boolean}
   */
  function isValidStoreIdFormat(storeId) {
    const id = String(storeId || '').trim();
    if (!id) {
      return false;
    }
    if (KNOWN_LITERAL_STORE_IDS.has(id)) {
      return true;
    }
    if (STORE_ID_ZZ_QA_RE.test(id)) {
      return true;
    }
    if (STORE_ID_ZZ_DENY_RE.test(id)) {
      return true;
    }
    if (STORE_ID_LETTER_SIX_DIGITS_RE.test(id)) {
      return true;
    }
    return false;
  }

  /**
   * @param {unknown} err
   * @returns {string}
   */
  function resolveErrorCodeFromErr(err) {
    const response = err && err.response ? err.response : null;
    if (response && response.code != null && String(response.code)) {
      return String(response.code);
    }
    const status = err && err.status ? Number(err.status) : 0;
    if (status === 401) {
      return 'unauthorized';
    }
    if (status === 403) {
      return 'forbidden';
    }
    return '';
  }

  /**
   * @param {unknown} err
   * @returns {string}
   */
  function resolveStoreAccessUserMessage(err) {
    const code = resolveErrorCodeFromErr(err);
    if (code === 'store_id_invalid') {
      return MSG_STORE_ID_INVALID;
    }
    if (code === 'store_not_allowed') {
      return MSG_STORE_NOT_REGISTERED;
    }
    if (code === 'dev_store_registry_full') {
      return MSG_REGISTRY_FULL;
    }
    return '';
  }

  /**
   * @param {unknown} err
   * @returns {string}
   */
  function listStoresErrorLine(err) {
    const status = err && err.status ? Number(err.status) : 0;
    const code = resolveErrorCodeFromErr(err);
    if (status === 401 || code === 'unauthorized' || code === 'invalid_token') {
      return '門市清單：登入已過期';
    }
    if (status === 403 || code === 'forbidden' || code === 'store_not_allowed') {
      return '門市清單：沒有權限';
    }
    if (err && err.message === 'Failed to fetch') {
      return '門市清單：網路連線失敗';
    }
    if (status >= 500) {
      return '門市清單：雲端暫時無法取得';
    }
    if (status > 0) {
      return '門市清單：無法載入（' + status + '）';
    }
    return '門市清單：無法載入';
  }

  /**
   * @param {Array<{ storeId: string }>} stores
   * @returns {Array<object>}
   */
  function sortStoresByStoreId(stores) {
    return (stores || [])
      .slice()
      .sort(function (a, b) {
        return String(a.storeId).localeCompare(String(b.storeId));
      });
  }

  /**
   * @param {Array<{ storeId: string, test?: boolean }>} stores
   * @param {string} urlStoreId
   * @returns {Array<object>}
   */
  function filterStoresForPicker(stores, urlStoreId) {
    const pinned = String(urlStoreId || '').trim();
    return (stores || []).filter(function (s) {
      if (!s || !s.storeId) {
        return false;
      }
      if (s.test === true && s.storeId !== pinned) {
        return false;
      }
      return true;
    });
  }

  /**
   * @param {Array<object>} stores
   * @param {string} storeId
   * @param {string} [label]
   * @returns {Array<object>}
   */
  function mergePinnedStore(stores, storeId, label) {
    const id = String(storeId || '').trim();
    if (!id) {
      return stores || [];
    }
    const list = (stores || []).slice();
    const found = list.some(function (s) {
      return s && s.storeId === id;
    });
    if (found) {
      return list;
    }
    list.push({
      storeId: id,
      name: label || id,
      online: false,
      test: id.indexOf('zz-qa-') === 0,
      lastSeenAt: null,
      registeredAt: null,
      devices: [],
    });
    return list;
  }

  /**
   * @param {{ storeId: string, name?: string, online?: boolean }} store
   * @returns {{ text: string, onlineClass: string }}
   */
  function formatStoreOptionMeta(store) {
    const name = store.name && String(store.name).trim() ? String(store.name).trim() : store.storeId;
    const online = Boolean(store.online);
    const statusWord = online ? 'online' : 'offline';
    const onlineClass = online ? 'store-online' : 'store-offline';
    const text = name + ' (' + store.storeId + ') · ' + statusWord;
    return { text: text, onlineClass: onlineClass };
  }

  /**
   * @param {object} config
   * @param {{ authHeaders: () => Promise<Record<string,string>>, refreshIdToken?: () => Promise<void> }} session
   * @param {boolean} [authRetried]
   * @returns {Promise<object>}
   */
  async function fetchListStores(config, session, authRetried) {
    const base = String(config && config.functionsBaseUrl ? config.functionsBaseUrl : '').replace(/\/?$/, '/');
    if (!base) {
      const err = new Error('missing functions base url');
      err.status = 0;
      throw err;
    }
    const headers = Object.assign({ 'Content-Type': 'application/json' }, await session.authHeaders());
    const res = await fetch(base + 'listStores', {
      method: 'POST',
      headers: headers,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (e) {
      json = { raw: text };
    }
    if (!res.ok) {
      if (res.status === 401 && session.refreshIdToken && !authRetried) {
        try {
          await session.refreshIdToken();
          return fetchListStores(config, session, true);
        } catch (refreshErr) {
          const err = new Error('login expired');
          err.status = 401;
          err.response = json;
          throw err;
        }
      }
      const err = new Error('listStores failed ' + res.status);
      err.status = res.status;
      err.response = json;
      throw err;
    }
    return json || { stores: [] };
  }

  QMS.Controller.StoreList = {
    STORE_LIST_POLL_MS: STORE_LIST_POLL_MS,
    ONLINE_WINDOW_SEC_DEFAULT: ONLINE_WINDOW_SEC_DEFAULT,
    MSG_STORE_ID_INVALID: MSG_STORE_ID_INVALID,
    MSG_STORE_NOT_REGISTERED: MSG_STORE_NOT_REGISTERED,
    MSG_REGISTRY_FULL: MSG_REGISTRY_FULL,
    isValidStoreIdFormat: isValidStoreIdFormat,
    resolveErrorCodeFromErr: resolveErrorCodeFromErr,
    resolveStoreAccessUserMessage: resolveStoreAccessUserMessage,
    listStoresErrorLine: listStoresErrorLine,
    sortStoresByStoreId: sortStoresByStoreId,
    filterStoresForPicker: filterStoresForPicker,
    mergePinnedStore: mergePinnedStore,
    formatStoreOptionMeta: formatStoreOptionMeta,
    fetchListStores: fetchListStores,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
