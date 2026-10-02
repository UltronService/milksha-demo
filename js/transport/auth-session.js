/**
 * devLogin → custom token → idToken / refreshToken
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const STORAGE_PREFIX = 'milksha:auth:';

  /**
   * @param {object} config
   * @param {object} creds
   */
  function createAuthSession(config, creds) {
    const storage = creds.storage || root.localStorage;
    const storageKey =
      STORAGE_PREFIX + creds.storeId + ':' + creds.role + ':' + (creds.deviceId || 'ctrl');

    let idToken = '';
    let refreshToken = '';
    let expiresAtMs = 0;

    function loadStored() {
      try {
        const raw = storage.getItem(storageKey);
        if (!raw) {
          return;
        }
        const parsed = JSON.parse(raw);
        idToken = parsed.idToken || '';
        refreshToken = parsed.refreshToken || '';
        expiresAtMs = parsed.expiresAtMs || 0;
      } catch (e) {
        /* ignore */
      }
    }

    function persist() {
      try {
        storage.setItem(
          storageKey,
          JSON.stringify({ idToken: idToken, refreshToken: refreshToken, expiresAtMs: expiresAtMs }),
        );
      } catch (e) {
        /* ignore */
      }
    }

    loadStored();

    function functionsUrl(name) {
      const base = config.functionsBaseUrl || '';
      return base.replace(/\/?$/, '/') + name;
    }

    async function devLogin() {
      const body = {
        storeId: creds.storeId,
        role: creds.role,
        deviceId: creds.deviceId || 'controller-web',
        accessCode: creds.accessCode || '',
      };
      const res = await fetch(functionsUrl('devLogin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error('devLogin failed ' + res.status);
      }
      const json = await res.json();
      if (!json.customToken) {
        throw new Error('devLogin missing customToken');
      }
      return json.customToken;
    }

    async function signInWithCustomToken(customToken) {
      const url =
        (config.identityToolkitBaseUrl || '').replace(/\/?$/, '') +
        '/accounts:signInWithCustomToken?key=' +
        encodeURIComponent(config.apiKey || 'fake-api-key');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      });
      if (!res.ok) {
        throw new Error('signInWithCustomToken failed ' + res.status);
      }
      const json = await res.json();
      idToken = json.idToken || '';
      refreshToken = json.refreshToken || '';
      const expiresIn = Number(json.expiresIn || 3600);
      expiresAtMs = Date.now() + expiresIn * 1000 - 60000;
      persist();
      return idToken;
    }

    async function refreshIdToken() {
      if (!refreshToken) {
        throw new Error('no refresh token');
      }
      const url =
        (config.secureTokenBaseUrl || 'https://securetoken.googleapis.com/v1').replace(/\/?$/, '') +
        '/token?key=' +
        encodeURIComponent(config.apiKey || 'fake-api-key');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:
          'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
      });
      if (!res.ok) {
        throw new Error('token refresh failed ' + res.status);
      }
      const json = await res.json();
      idToken = json.id_token || json.idToken || '';
      refreshToken = json.refresh_token || json.refreshToken || refreshToken;
      const expiresIn = Number(json.expires_in || json.expiresIn || 3600);
      expiresAtMs = Date.now() + expiresIn * 1000 - 60000;
      persist();
      return idToken;
    }

    async function ensureIdToken() {
      if (idToken && Date.now() < expiresAtMs) {
        return idToken;
      }
      if (refreshToken) {
        try {
          return await refreshIdToken();
        } catch (e) {
          /* fall through */
        }
      }
      const custom = await devLogin();
      return signInWithCustomToken(custom);
    }

    async function authHeaders() {
      const token = await ensureIdToken();
      return { Authorization: 'Bearer ' + token };
    }

    return {
      ensureIdToken: ensureIdToken,
      authHeaders: authHeaders,
      devLogin: devLogin,
      getIdToken: function () {
        return idToken;
      },
    };
  }

  QMS.Transport.createAuthSession = createAuthSession;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
