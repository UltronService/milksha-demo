/**
 * Local POC: align controller + board store/device without reloading the board tab.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const POC_TARGET_KEY = 'milksha:local:poc-target';
  const POC_CHANNEL_NAME = 'milksha-local-poc';
  const DEFAULT_STORE_ID = 'c030020';
  const DEFAULT_DEVICE_ID = 'stb-01';

  /**
   * @param {Storage} storage
   * @returns {{ storeId: string, deviceId: string, build?: string, at?: number } | null}
   */
  function readLocalPocTarget(storage) {
    const store = storage || root.localStorage;
    if (!store) {
      return null;
    }
    try {
      const raw = store.getItem(POC_TARGET_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.storeId !== 'string' || typeof parsed.deviceId !== 'string') {
        return null;
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  /**
   * @param {Storage} storage
   * @param {{ storeId: string, deviceId: string, build?: string }} target
   */
  function publishLocalPocTarget(storage, target) {
    const store = storage || root.localStorage;
    if (!store || !target) {
      return;
    }
    const payload = {
      storeId: String(target.storeId),
      deviceId: String(target.deviceId),
      build: target.build ? String(target.build) : '',
      at: Date.now(),
    };
    store.setItem(POC_TARGET_KEY, JSON.stringify(payload));
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const ch = new BroadcastChannel(POC_CHANNEL_NAME);
        ch.postMessage({ type: 'poc-target', target: payload });
        ch.close();
      } catch (e) {
        /* ignore */
      }
    }
  }

  /**
   * @param {Storage} storage
   * @param {{ homeBoard?: boolean, fallbackStoreId?: string, fallbackDeviceId?: string }} [opts]
   */
  function resolveLocalDeviceContext(storage, opts) {
    const options = opts || {};
    const poc = readLocalPocTarget(storage);
    if (poc) {
      return { storeId: poc.storeId, deviceId: poc.deviceId, source: 'poc-target' };
    }
    if (options.homeBoard) {
      return {
        storeId: DEFAULT_STORE_ID,
        deviceId: DEFAULT_DEVICE_ID,
        source: 'home-default',
      };
    }
    return {
      storeId: options.fallbackStoreId || DEFAULT_STORE_ID,
      deviceId: options.fallbackDeviceId || DEFAULT_DEVICE_ID,
      source: 'fallback',
    };
  }

  /**
   * @param {Storage} storage
   * @param {string} expectedStoreId
   * @param {number} staleMs
   * @returns {{ storeId: string, deviceId: string, lastSeen: string } | null}
   */
  function findForeignRecentHeartbeat(storage, expectedStoreId, staleMs) {
    const store = storage || root.localStorage;
    if (!store) {
      return null;
    }
    const now = Date.now();
    const maxAge = staleMs > 0 ? staleMs : 300000;
    const prefix = 'milksha:local:device:';
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (!key || key.indexOf(prefix) !== 0) {
        continue;
      }
      const rest = key.slice(prefix.length);
      const colon = rest.indexOf(':');
      if (colon <= 0) {
        continue;
      }
      const storeId = rest.slice(0, colon);
      if (storeId === expectedStoreId) {
        continue;
      }
      try {
        const data = JSON.parse(store.getItem(key) || 'null');
        if (!data || !data.online || !data.lastSeen) {
          continue;
        }
        if (now - Date.parse(data.lastSeen) >= maxAge) {
          continue;
        }
        return {
          storeId: storeId,
          deviceId: rest.slice(colon + 1),
          lastSeen: data.lastSeen,
        };
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  }

  /**
   * @param {(target: { storeId: string, deviceId: string }) => void} handler
   * @returns {() => void}
   */
  function subscribeLocalPocTarget(handler) {
    const onStorage = function (ev) {
      if (ev.key !== POC_TARGET_KEY) {
        return;
      }
      const poc = readLocalPocTarget(root.localStorage);
      if (poc) {
        handler(poc);
      }
    };
    let channel = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(POC_CHANNEL_NAME);
        channel.onmessage = function (ev) {
          const msg = ev.data;
          if (msg && msg.type === 'poc-target' && msg.target) {
            handler(msg.target);
          }
        };
      } catch (e) {
        channel = null;
      }
    }
    root.addEventListener('storage', onStorage);
    return function unsubscribe() {
      root.removeEventListener('storage', onStorage);
      if (channel) {
        channel.close();
        channel = null;
      }
    };
  }

  QMS.Transport.LocalPocCoord = {
    POC_TARGET_KEY: POC_TARGET_KEY,
    POC_CHANNEL_NAME: POC_CHANNEL_NAME,
    DEFAULT_STORE_ID: DEFAULT_STORE_ID,
    DEFAULT_DEVICE_ID: DEFAULT_DEVICE_ID,
    readLocalPocTarget: readLocalPocTarget,
    publishLocalPocTarget: publishLocalPocTarget,
    resolveLocalDeviceContext: resolveLocalDeviceContext,
    findForeignRecentHeartbeat: findForeignRecentHeartbeat,
    subscribeLocalPocTarget: subscribeLocalPocTarget,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
