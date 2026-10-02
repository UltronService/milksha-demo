/**
 * Cloud Functions writes (heartbeat, devCommand, posIngest).
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

    async function postJson(name, body) {
      const headers = await session.authHeaders();
      const res = await fetch(fnUrl(name), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
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

    return {
      heartbeat: function (body) {
        return postJson('heartbeat', body);
      },
      devCommand: function (body) {
        return postJson('devCommand', body);
      },
      posIngest: function (body) {
        const name = config.posIngestFunctionName || 'posIngest';
        return postJson(name, body);
      },
    };
  }

  QMS.Transport.createCloudApi = createCloudApi;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
