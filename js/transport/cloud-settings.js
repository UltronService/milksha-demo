/**
 * Cloud mode settings (localStorage). No secrets in repo — user fills on device.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const STORAGE_KEY = 'milksha:cloud-settings';
  const PROJECT_ID_RE = /^[a-z0-9-]{6,30}$/;
  const REGION_RE = /^[a-z]+-[a-z]+\d$/;

  function isDevSettingsHost() {
    try {
      const loc = root.location;
      if (!loc) {
        return false;
      }
      const host = String(loc.hostname || '');
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch (e) {
      return false;
    }
  }

  function defaults() {
    return {
      projectId: '',
      apiKey: '',
      region: 'asia-east1',
      useEmulator: false,
      gateway: '',
      emulatorPrefix: '',
    };
  }

  function stripDevFields(settings) {
    const s = Object.assign({}, settings || {});
    if (!isDevSettingsHost()) {
      s.gateway = '';
      s.emulatorPrefix = '';
      s.useEmulator = false;
    }
    return s;
  }

  function bundledFromConfig() {
    const b = root.MILKSHA_FIREBASE_CONFIG || {};
    return {
      projectId: String(b.projectId || '').trim(),
      apiKey: String(b.apiKey || '').trim(),
      region: String(b.region || 'asia-east1').trim() || 'asia-east1',
    };
  }

  function load(storage) {
    const s = storage || root.localStorage;
    try {
      const raw = s.getItem(STORAGE_KEY);
      if (!raw) {
        return defaults();
      }
      return stripDevFields(Object.assign(defaults(), JSON.parse(raw)));
    } catch (e) {
      return defaults();
    }
  }

  /** Saved settings merged with MILKSHA_FIREBASE_CONFIG (Pages 內建、免手動填寫). */
  function effective(partial, storage) {
    const saved = stripDevFields(Object.assign(defaults(), partial || load(storage)));
    const bundled = bundledFromConfig();
    return stripDevFields({
      projectId: saved.projectId || bundled.projectId,
      apiKey: saved.apiKey || bundled.apiKey,
      region: saved.region || bundled.region,
      useEmulator: saved.useEmulator,
      gateway: saved.gateway,
      emulatorPrefix: saved.emulatorPrefix,
    });
  }

  function isBundledCloudReady() {
    return isComplete(effective());
  }

  function prefersDefaultCloudMode() {
    const b = root.MILKSHA_FIREBASE_CONFIG || {};
    if (b.defaultCloudMode === false) {
      return false;
    }
    return Boolean(b.defaultCloudMode) || isBundledCloudReady();
  }

  function save(partial, storage) {
    const s = storage || root.localStorage;
    const merged = stripDevFields(Object.assign(load(s), partial || {}));
    s.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  function isComplete(settings) {
    const s = settings ? effective(settings) : effective();
    if (!String(s.projectId || '').trim() || !String(s.apiKey || '').trim()) {
      return false;
    }
    if (!PROJECT_ID_RE.test(String(s.projectId || '').trim())) {
      return false;
    }
    if (!REGION_RE.test(String(s.region || 'asia-east1').trim())) {
      return false;
    }
    if (s.useEmulator && !String(s.gateway || '').trim()) {
      return false;
    }
    return true;
  }

  function base64UrlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 1) {
      bin += String.fromCharCode(bytes[i]);
    }
    const b64 = root.btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlDecode(encoded) {
    let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) {
      b64 += '=';
    }
    const bin = root.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  function cfgPayload(settings) {
    const s = effective(settings);
    return {
      projectId: String(s.projectId || '').trim(),
      apiKey: String(s.apiKey || '').trim(),
      region: String(s.region || 'asia-east1').trim() || 'asia-east1',
    };
  }

  function normalizeImportedCfg(json) {
    if (!json || typeof json !== 'object') {
      return null;
    }
    const projectId = String(json.projectId || '').trim();
    const apiKey = String(json.apiKey || '').trim();
    const region = String(json.region || 'asia-east1').trim() || 'asia-east1';
    if (!PROJECT_ID_RE.test(projectId)) {
      return null;
    }
    if (!REGION_RE.test(region)) {
      return null;
    }
    if (!apiKey) {
      return null;
    }
    return {
      projectId: projectId,
      apiKey: apiKey,
      region: region,
      useEmulator: false,
      gateway: '',
      emulatorPrefix: '',
    };
  }

  function stripBoardCfgFields(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    return normalizeImportedCfg(obj);
  }

  function encodeCfgHash(settings) {
    return base64UrlEncode(JSON.stringify(cfgPayload(settings)));
  }

  function decodeCfgHash(fragment) {
    const raw = String(fragment || '').replace(/^#/, '');
    const m = /^cfg=(.+)$/.exec(raw);
    if (!m) {
      return null;
    }
    try {
      const json = JSON.parse(base64UrlDecode(m[1]));
      return normalizeImportedCfg(json);
    } catch (e) {
      return null;
    }
  }

  /** @returns {boolean} true if fragment may contain POS signing material */
  function hashContainsForbiddenSecrets(fragment, forbiddenValues) {
    const raw = String(fragment || '');
    const list = forbiddenValues || [];
    for (let i = 0; i < list.length; i += 1) {
      const v = String(list[i] || '');
      if (v && raw.indexOf(v) >= 0) {
        return true;
      }
    }
    try {
      const parsed = decodeCfgHash(raw.startsWith('#') ? raw : '#cfg=' + raw.replace(/^.*cfg=/, 'cfg='));
      if (!parsed) {
        return false;
      }
      const keys = Object.keys(parsed);
      for (let k = 0; k < keys.length; k += 1) {
        const name = keys[k];
        if (/pos/i.test(name) && /sign|secret|key/i.test(name)) {
          return true;
        }
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  function clearCfgHashFromUrl() {
    const path = root.location.pathname + root.location.search;
    if (root.history && root.history.replaceState) {
      root.history.replaceState(null, '', path);
      return;
    }
    root.location.hash = '';
  }

  function applyHashImport(storage) {
    const frag = root.location.hash || '';
    if (frag.indexOf('cfg=') < 0) {
      return false;
    }
    const parsed = decodeCfgHash(frag);
    if (!parsed || !parsed.projectId) {
      clearCfgHashFromUrl();
      return false;
    }
    save(parsed, storage);
    clearCfgHashFromUrl();
    return true;
  }

  function productionEndpoints(projectId, region) {
    const pid = String(projectId || '').trim();
    const reg = String(region || 'asia-east1').trim() || 'asia-east1';
    if (!PROJECT_ID_RE.test(pid) || !REGION_RE.test(reg)) {
      return {
        functionsBaseUrl: '',
        firestoreRestBase: '',
        identityToolkitBaseUrl: '',
        firestoreEmulatorHost: '',
      };
    }
    return {
      functionsBaseUrl: 'https://' + reg + '-' + pid + '.cloudfunctions.net/',
      firestoreRestBase:
        'https://firestore.googleapis.com/v1/projects/' + pid + '/databases/(default)/documents',
      identityToolkitBaseUrl: 'https://identitytoolkit.googleapis.com/v1',
      firestoreEmulatorHost: '',
    };
  }

  QMS.Transport.CloudSettings = {
    STORAGE_KEY: STORAGE_KEY,
    PROJECT_ID_RE: PROJECT_ID_RE,
    REGION_RE: REGION_RE,
    defaults: defaults,
    load: load,
    save: save,
    effective: effective,
    bundledFromConfig: bundledFromConfig,
    isBundledCloudReady: isBundledCloudReady,
    prefersDefaultCloudMode: prefersDefaultCloudMode,
    isComplete: isComplete,
    encodeCfgHash: encodeCfgHash,
    decodeCfgHash: decodeCfgHash,
    applyHashImport: applyHashImport,
    cfgPayload: cfgPayload,
    normalizeImportedCfg: normalizeImportedCfg,
    stripBoardCfgFields: stripBoardCfgFields,
    hashContainsForbiddenSecrets: hashContainsForbiddenSecrets,
    productionEndpoints: productionEndpoints,
    isDevSettingsHost: isDevSettingsHost,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
