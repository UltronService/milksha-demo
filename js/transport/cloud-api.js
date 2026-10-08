/**
 * Cloud Functions: devLogin, devCommand, boxHeartbeat, posReceiver, boxUpload.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  /**
   * @param {object} config
   * @param {{ authHeaders: () => Promise<Record<string,string>> }} session
   */
  function createCloudApi(config, session) {
    const boxHeartbeatName = config.boxHeartbeatFunctionName || 'boxHeartbeat';
    const posReceiverName = config.posReceiverFunctionName || 'posReceiver';
    const boxUploadName = config.boxUploadFunctionName || 'boxUpload';

    function fnUrl(name) {
      const base = config.functionsBaseUrl || '';
      return base.replace(/\/?$/, '/') + name;
    }

    async function postJson(name, body, withAuth, rawBody, authRetried) {
      const headers = { 'Content-Type': 'application/json' };
      if (withAuth) {
        Object.assign(headers, await session.authHeaders());
      }
      const payload = rawBody !== undefined && rawBody !== null ? rawBody : JSON.stringify(body);
      const res = await fetch(fnUrl(name), {
        method: 'POST',
        headers: headers,
        body: payload,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        json = { raw: text };
      }
      const isPos = name === posReceiverName || name === posReceiverName + '/';
      if (isPos && res.ok) {
        return json || { isSuccess: false, information: '空回應' };
      }
      if (!res.ok) {
        if (withAuth && res.status === 403 && session.markUploadHaltedFrom403) {
          const err403 = new Error((name || 'fn') + ' failed ' + res.status);
          err403.status = 403;
          err403.response = json;
          session.markUploadHaltedFrom403(err403);
        }
        if (withAuth && res.status === 401 && session.refreshIdToken && !authRetried) {
          try {
            await session.refreshIdToken();
            return postJson(name, body, withAuth, rawBody, true);
          } catch (refreshErr) {
            const err = new Error('login expired, please sign in again');
            err.status = 401;
            err.response = json;
            throw err;
          }
        }
        const err = new Error((name || 'fn') + ' failed ' + res.status);
        err.status = res.status;
        err.response = json;
        throw err;
      }
      if (session.noteBootServerTimeFromResponse) {
        session.noteBootServerTimeFromResponse(res);
      }
      return json;
    }

    return {
      devLogin: function (body) {
        return postJson('devLogin', body, false);
      },
      boxHeartbeat: function (body) {
        const Dev = QMS.Transport.DevCommandValidation;
        const payload = Dev && Dev.buildBoxHeartbeatRequest ? Dev.buildBoxHeartbeatRequest(body) : { ok: true, body: body };
        if (!payload.ok) {
          const err = new Error(payload.message || 'invalid heartbeat');
          err.status = 400;
          err.response = { code: payload.code, message: payload.message };
          return Promise.reject(err);
        }
        return postJson(boxHeartbeatName, payload.body, true);
      },
      devCommand: function (body) {
        const Dev = QMS.Transport.DevCommandValidation;
        const payload = Dev && Dev.buildDevCommandRequest ? Dev.buildDevCommandRequest(body) : { ok: true, body: body };
        if (!payload.ok) {
          const err = new Error(payload.message || 'invalid command');
          err.status = 400;
          err.response = { code: payload.code, message: payload.message };
          return Promise.reject(err);
        }
        return postJson('devCommand', payload.body, true);
      },
      posReceiver: function (body) {
        if (typeof body === 'string') {
          return postJson(posReceiverName, null, false, body);
        }
        if (body && typeof body.wireText === 'string') {
          return postJson(posReceiverName, null, false, body.wireText);
        }
        return postJson(posReceiverName, body, false);
      },
      boxUpload: function (body) {
        return postJson(boxUploadName, body, true);
      },
    };
  }

  QMS.Transport.createCloudApi = createCloudApi;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
