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
    function fnUrl(name) {
      const base = config.functionsBaseUrl || '';
      return base.replace(/\/?$/, '/') + name;
    }

    async function postJson(name, body, withAuth) {
      const headers = { 'Content-Type': 'application/json' };
      if (withAuth) {
        Object.assign(headers, await session.authHeaders());
      }
      const res = await fetch(fnUrl(name), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (e) {
        json = { raw: text };
      }
      if (!res.ok) {
        const err = new Error((name || 'fn') + ' failed ' + res.status);
        err.response = json;
        throw err;
      }
      return json;
    }

    const boxHeartbeatName = config.boxHeartbeatFunctionName || 'boxHeartbeat';
    const posReceiverName = config.posReceiverFunctionName || 'posReceiver';
    const boxUploadName = config.boxUploadFunctionName || 'boxUpload';

    return {
      devLogin: function (body) {
        return postJson('devLogin', body, false);
      },
      boxHeartbeat: function (body) {
        return postJson(boxHeartbeatName, body, true);
      },
      devCommand: function (body) {
        return postJson('devCommand', body, true);
      },
      posReceiver: function (body) {
        return postJson(posReceiverName, body, false);
      },
      boxUpload: function (body) {
        return postJson(boxUploadName, body, true);
      },
    };
  }

  QMS.Transport.createCloudApi = createCloudApi;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
