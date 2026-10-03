/**
 * Cloud mode settings (localStorage). No secrets in repo — user fills on device.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const STORAGE_KEY = 'milksha:cloud-settings';

  function defaults() {
    return {
      projectId: '',
      apiKey: '',
      region: 'asia-east1',
      accessCode: '',
      useEmulator: false,
      gateway: '',
      emulatorPrefix: '',
    };
  }

  function load(storage) {
    const s = storage || root.localStorage;
    try {
      const raw = s.getItem(STORAGE_KEY);
      if (!raw) {
        return defaults();
      }
      return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) {
      return defaults();
    }
  }

  function save(partial, storage) {
    const s = storage || root.localStorage;
    const merged = Object.assign(load(s), partial || {});
    s.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  function isComplete(settings) {
    const s = settings || load();
    if (!String(s.projectId || '').trim() || !String(s.apiKey || '').trim()) {
      return false;
    }
    if (!String(s.accessCode || '').trim()) {
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
    const s = settings || load();
    return {
      projectId: String(s.projectId || '').trim(),
      apiKey: String(s.apiKey || '').trim(),
      region: String(s.region || 'asia-east1').trim() || 'asia-east1',
      accessCode: String(s.accessCode || '').trim(),
    };
  }

  function stripBoardCfgFields(obj) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    const out = Object.assign({}, obj);
    delete out.posSignSecret;
    delete out.posSignKey;
    delete out.pos_sign_secret;
    delete out.posSigningKey;
    return out;
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
      return Object.assign(defaults(), stripBoardCfgFields(json));
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

  function applyHashImport(storage) {
    const frag = root.location.hash || '';
    if (frag.indexOf('cfg=') < 0) {
      return false;
    }
    const parsed = decodeCfgHash(frag);
    if (!parsed || !parsed.projectId) {
      return false;
    }
    save(stripBoardCfgFields(parsed), storage);
    const path = root.location.pathname + root.location.search;
    if (root.history && root.history.replaceState) {
      root.history.replaceState(null, '', path);
    } else {
      root.location.hash = '';
    }
    return true;
  }

  function productionEndpoints(projectId, region) {
    const pid = String(projectId || '').trim();
    const reg = String(region || 'asia-east1').trim() || 'asia-east1';
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
    defaults: defaults,
    load: load,
    save: save,
    isComplete: isComplete,
    encodeCfgHash: encodeCfgHash,
    decodeCfgHash: decodeCfgHash,
    applyHashImport: applyHashImport,
    cfgPayload: cfgPayload,
    stripBoardCfgFields: stripBoardCfgFields,
    hashContainsForbiddenSecrets: hashContainsForbiddenSecrets,
    productionEndpoints: productionEndpoints,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
