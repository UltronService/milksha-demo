/**
 * Milksha receiver request validation (shared by receiver-demo & controller).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Receiver = QMS.Receiver || {};

  const SOURCE_DEFS = [
    { prefix: 'From_Store_', key: 'store' },
    { prefix: 'From_milksha_point_', key: 'point' },
    { prefix: 'From_FoodPanda_', key: 'fp' },
    { prefix: 'From_UberEat_', key: 'uber' },
    { prefix: 'From_Udd_', key: 'udd' },
  ];

  const VALID_TYPES = {};
  for (let si = 0; si < SOURCE_DEFS.length; si += 1) {
    const p = SOURCE_DEFS[si].prefix;
    VALID_TYPES[p + 'OK'] = true;
    VALID_TYPES[p + 'Preparing'] = true;
  }

  const MSG = {
    ok: '資料顯示成功',
    offline: '目標叫號機尚未連線',
    notFound: '找不到目標叫號機',
    format: '叫號資料格式錯誤',
    stale: '資料序號過舊，已忽略',
  };

  const STORES = [
    {
      id: 's120030',
      name: '迷客夏臺南東安店',
      merchant_id: 'milksha',
      account: 's120030',
      target: 'milkshas120030',
    },
    {
      id: 's110012',
      name: '迷客夏台北忠孝店',
      merchant_id: 'milksha',
      account: 's110012',
      target: 'milkshas110012',
    },
    {
      id: 's210008',
      name: '迷客夏高雄三多店',
      merchant_id: 'milksha',
      account: 's210008',
      target: 'milkshas210008',
    },
  ];

  const ORDER_SOURCES = [
    { key: 'store', label: '現場', preparing: 'From_Store_Preparing', ok: 'From_Store_OK' },
    { key: 'point', label: '迷點', preparing: 'From_milksha_point_Preparing', ok: 'From_milksha_point_OK' },
    { key: 'phone', label: '電話', preparing: 'From_Store_Preparing', ok: 'From_Store_OK' },
    { key: 'online', label: '線上點餐', preparing: 'From_milksha_point_Preparing', ok: 'From_milksha_point_OK' },
    { key: 'uber', label: 'Uber Eats', preparing: 'From_UberEat_Preparing', ok: 'From_UberEat_OK' },
    { key: 'fp', label: 'foodpanda', preparing: 'From_FoodPanda_Preparing', ok: 'From_FoodPanda_OK' },
  ];

  const TAMMY_SAMPLE_REQUEST = {
    isEncrypt: false,
    serviceSpecialData_Json: {
      target: 'milkshas120030',
      data: {
        number_content: [
          { source_type: 'From_Store_OK', number: '1488' },
          { source_type: 'From_Store_Preparing', number: '1985' },
        ],
        newsTicker_content: [],
        newsTickerSpeed: 0,
      },
    },
    merchant_id: 'milksha',
    account: 's120030',
    timeStmp: '2026-07-17-13-17-00:2831',
    serviceSpecialData_Json_Md5Hash: 'demo-tammy-hash',
    signature: 'DEMO-NO-SIGNATURE',
  };

  function milkshaTargetForAccount(account) {
    return 'milksha' + String(account || '');
  }

  function findStore(id) {
    for (let i = 0; i < STORES.length; i += 1) {
      if (STORES[i].id === id) {
        return STORES[i];
      }
    }
    return STORES[0];
  }

  function parseSourceType(st) {
    if (!st || typeof st !== 'string') {
      return null;
    }
    for (let i = 0; i < SOURCE_DEFS.length; i += 1) {
      const def = SOURCE_DEFS[i];
      if (st.indexOf(def.prefix) !== 0) {
        continue;
      }
      const rest = st.slice(def.prefix.length);
      if (rest === 'OK') {
        return { sourceKey: def.key, zone: 'ready' };
      }
      if (rest === 'Preparing') {
        return { sourceKey: def.key, zone: 'preparing' };
      }
      return null;
    }
    return null;
  }

  function itemId(sourceKey, number) {
    return sourceKey + ':' + String(number);
  }

  /**
   * @param {object} body
   * @returns {{ ok: true, target: string, numberContent: object[] } | { error: string }}
   */
  function validateRequestBody(body) {
    if (!body || typeof body !== 'object') {
      return { error: MSG.format };
    }
    const ssd = body.serviceSpecialData_Json;
    if (!ssd || typeof ssd !== 'object') {
      return { error: MSG.format };
    }
    if (typeof ssd.target !== 'string' || !ssd.target) {
      return { error: MSG.format };
    }
    if (!ssd.data || typeof ssd.data !== 'object') {
      return { error: MSG.format };
    }
    if (!Array.isArray(ssd.data.number_content)) {
      return { error: MSG.format };
    }
    const nc = ssd.data.number_content;
    for (let i = 0; i < nc.length; i += 1) {
      const row = nc[i];
      if (!row || typeof row !== 'object') {
        return { error: MSG.format };
      }
      if (typeof row.source_type !== 'string' || typeof row.number !== 'string') {
        return { error: MSG.format };
      }
      if (!VALID_TYPES[row.source_type]) {
        return { error: MSG.format };
      }
    }
    return { ok: true, target: ssd.target, numberContent: nc };
  }

  QMS.Receiver.Validate = {
    SOURCE_DEFS: SOURCE_DEFS,
    VALID_TYPES: VALID_TYPES,
    MSG: MSG,
    STORES: STORES,
    ORDER_SOURCES: ORDER_SOURCES,
    TAMMY_SAMPLE_REQUEST: TAMMY_SAMPLE_REQUEST,
    milkshaTargetForAccount: milkshaTargetForAccount,
    findStore: findStore,
    parseSourceType: parseSourceType,
    itemId: itemId,
    validateRequestBody: validateRequestBody,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
