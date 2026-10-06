/**
 * devLogin → custom token → idToken / refreshToken
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const STORAGE_PREFIX = 'milksha:auth:';

  function isDevHttpAllowed() {
    if (QMS.Transport.isDevEndpointOverrideAllowed) {
      return QMS.Transport.isDevEndpointOverrideAllowed();
    }
    try {
      const host = root.location && root.location.hostname;
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch (e) {
      return false;
    }
  }

  function isSecureTargetUrl(urlStr) {
    try {
      const u = new URL(String(urlStr || ''));
      if (u.protocol === 'https:') {
        return true;
      }
      const host = u.hostname;
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch (e) {
      return false;
    }
  }

  function assertSecureTargetUrl(urlStr) {
    if (isSecureTargetUrl(urlStr)) {
      return;
    }
    const err = new Error('cloud auth requires https target');
    err.status = 400;
    err.response = { code: 'insecure_transport', message: 'cloud auth requires https target' };
    throw err;
  }

  function authHttpError(res, json, fallbackMessage) {
    const err = new Error(fallbackMessage || 'auth failed ' + res.status);
    err.status = res.status;
    err.response =
      json && typeof json === 'object'
        ? json
        : { code: 'auth_failed', message: fallbackMessage || 'auth failed' };
    return err;
  }

  /**
   * @param {object} config
   * @param {object} creds
   */
  function createAuthSession(config, creds) {
    const onAuthSuccess = creds.onAuthSuccess;
    const storage = creds.storage || root.localStorage;
    const storageKey =
      STORAGE_PREFIX + creds.storeId + ':' + creds.role + ':' + (creds.deviceId || 'ctrl');

    let idToken = '';
    let refreshToken = '';
    let expiresAtMs = 0;
    let authStopped = false;
    let accessDenied403 = false;
    let devLoginAttempts = 0;
    /** UTC ms from HTTP Date on first cloud response (not device clock). */
    let bootServerTimeMs = 0;
    /** @type {Promise<string> | null} */
    let devLoginInFlight = null;

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

    function clearStored() {
      idToken = '';
      refreshToken = '';
      expiresAtMs = 0;
      try {
        storage.removeItem(storageKey);
      } catch (e) {
        /* ignore */
      }
    }

    loadStored();

    function functionsUrl(name) {
      const base = config.functionsBaseUrl || '';
      return base.replace(/\/?$/, '/') + name;
    }

    function captureBootServerTimeFromResponse(res) {
      if (bootServerTimeMs > 0) {
        return;
      }
      if (!res || !res.headers || !res.headers.get) {
        return;
      }
      try {
        const raw = res.headers.get('date') || res.headers.get('Date') || '';
        if (!raw) {
          return;
        }
        const parsed = Date.parse(String(raw));
        if (!Number.isFinite(parsed)) {
          return;
        }
        bootServerTimeMs = parsed;
      } catch (e) {
        /* ignore */
      }
    }

    function noteBootServerTimeFromResponse(res) {
      captureBootServerTimeFromResponse(res);
    }

    function throwIfAuthStopped() {
      if (!authStopped) {
        return;
      }
      const err = new Error('auth stopped');
      err.status = 401;
      err.response = { code: 'auth_stopped', message: 'auth stopped' };
      throw err;
    }

    async function devLoginOnce() {
      throwIfAuthStopped();
      const loginUrl = functionsUrl('devLogin');
      assertSecureTargetUrl(loginUrl);
      const body = {
        storeId: creds.storeId,
        role: creds.role,
        deviceId: creds.deviceId || 'controller-web',
      };
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        json = null;
      }
      if (!res.ok) {
        devLoginAttempts += 1;
        if (res.status === 403) {
          accessDenied403 = true;
        }
        if (res.status === 401 && devLoginAttempts >= 2) {
          authStopped = true;
        }
        throw authHttpError(res, json, 'devLogin failed ' + res.status);
      }
      devLoginAttempts = 0;
      authStopped = false;
      accessDenied403 = false;
      captureBootServerTimeFromResponse(res);
      if (!json || !json.customToken) {
        const err = new Error('devLogin missing customToken');
        err.status = res.status || 500;
        err.response = json || { code: 'invalid_response', message: 'devLogin missing customToken' };
        throw err;
      }
      return json.customToken;
    }

    async function devLogin() {
      if (devLoginInFlight) {
        return devLoginInFlight;
      }
      devLoginInFlight = devLoginOnce().finally(function () {
        devLoginInFlight = null;
      });
      return devLoginInFlight;
    }

    async function signInWithCustomToken(customToken) {
      const url =
        (config.identityToolkitBaseUrl || '').replace(/\/?$/, '') +
        '/accounts:signInWithCustomToken?key=' +
        encodeURIComponent(config.apiKey || '');
      assertSecureTargetUrl(url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        json = null;
      }
      if (!res.ok) {
        throw authHttpError(res, json, 'signInWithCustomToken failed ' + res.status);
      }
      captureBootServerTimeFromResponse(res);
      idToken = json.idToken || '';
      refreshToken = json.refreshToken || '';
      const expiresIn = Number(json.expiresIn || 3600);
      expiresAtMs = Date.now() + expiresIn * 1000 - 60000;
      persist();
      devLoginAttempts = 0;
      authStopped = false;
      accessDenied403 = false;
      if (onAuthSuccess) {
        onAuthSuccess();
      }
      return idToken;
    }

    async function refreshIdToken() {
      if (!refreshToken) {
        const err = new Error('no refresh token');
        err.status = 401;
        err.response = { code: 'no_refresh_token', message: 'no refresh token' };
        throw err;
      }
      const url =
        (config.secureTokenBaseUrl || 'https://securetoken.googleapis.com/v1').replace(/\/?$/, '') +
        '/token?key=' +
        encodeURIComponent(config.apiKey || '');
      assertSecureTargetUrl(url);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:
          'grant_type=refresh_token&refresh_token=' + encodeURIComponent(refreshToken),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        json = null;
      }
      if (!res.ok) {
        if (res.status === 401) {
          authStopped = true;
        }
        throw authHttpError(res, json, 'token refresh failed ' + res.status);
      }
      devLoginAttempts = 0;
      authStopped = false;
      accessDenied403 = false;
      captureBootServerTimeFromResponse(res);
      idToken = json.id_token || json.idToken || '';
      refreshToken = json.refresh_token || json.refreshToken || refreshToken;
      const expiresIn = Number(json.expires_in || json.expiresIn || 3600);
      expiresAtMs = Date.now() + expiresIn * 1000 - 60000;
      persist();
      return idToken;
    }

    async function ensureIdToken() {
      throwIfAuthStopped();
      loadStored();
      if (expiresAtMs > 0 && Date.now() >= expiresAtMs) {
        idToken = '';
      }
      if (accessDenied403) {
        const custom = await devLogin();
        return signInWithCustomToken(custom);
      }
      if (idToken && Date.now() < expiresAtMs) {
        return idToken;
      }
      if (refreshToken) {
        try {
          return await refreshIdToken();
        } catch (e) {
          if (e && Number(e.status) === 401) {
            throw e;
          }
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
      refreshIdToken: refreshIdToken,
      devLogin: devLogin,
      clearStored: clearStored,
      resetAuthRetryState: function () {
        authStopped = false;
        devLoginAttempts = 0;
      },
      isAuthStopped: function () {
        return authStopped;
      },
      getIdToken: function () {
        return idToken;
      },
      getBootServerTimeMs: function () {
        return bootServerTimeMs;
      },
      noteBootServerTimeFromResponse: noteBootServerTimeFromResponse,
      isUploadHalted: function () {
        return accessDenied403;
      },
      clearUploadHalt: function () {
        accessDenied403 = false;
      },
    };
  }

  QMS.Transport.createAuthSession = createAuthSession;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
