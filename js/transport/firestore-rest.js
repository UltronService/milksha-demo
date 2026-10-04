/**
 * Minimal Firestore REST client (fetch only, single in-flight abort).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};
  const FV = QMS.Transport.FirestoreValue;

  /**
   * @param {{ projectId: string, apiKey: string, emulatorHost?: string }} cfg
   * @returns {string}
   */
  function baseUrl(cfg) {
    if (cfg.firestoreRestBase) {
      return cfg.firestoreRestBase.replace(/\/$/, '');
    }
    const host = cfg.firestoreEmulatorHost || cfg.emulatorHost;
    if (host) {
      return (
        'http://' +
        host +
        '/v1/projects/' +
        encodeURIComponent(cfg.projectId) +
        '/databases/(default)/documents'
      );
    }
    return (
      'https://firestore.googleapis.com/v1/projects/' +
      encodeURIComponent(cfg.projectId) +
      '/databases/(default)/documents'
    );
  }

  /**
   * @param {{ projectId: string, apiKey: string, emulatorHost?: string }} cfg
   * @param {string} docPath
   * @returns {string}
   */
  function docUrl(cfg, docPath) {
    const url = baseUrl(cfg) + '/' + docPath.replace(/^\//, '');
    const host = cfg.firestoreEmulatorHost || cfg.emulatorHost;
    if (!host && cfg.apiKey) {
      return url + '?key=' + encodeURIComponent(cfg.apiKey);
    }
    return url;
  }

  /**
   * @param {object} options
   */
  function createFirestoreRestClient(options) {
    const cfg = options.config;
    const getAuthHeaders = options.getAuthHeaders || null;
    /** @type {Map<string, AbortController>} */
    const inflightByPath = new Map();
    let backoffMs = 0;
    const maxBackoff = 30000;

    function sleep(ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms);
      });
    }

    /**
     * @param {string} docPath
     * @returns {Promise<{ data: Record<string, unknown>, updateTime: string } | null>}
     */
    async function getDocument(docPath) {
      const pathKey = 'doc:' + docPath;
      const prev = inflightByPath.get(pathKey);
      if (prev) {
        prev.abort();
      }
      const controller = new AbortController();
      inflightByPath.set(pathKey, controller);
      const signal = controller.signal;
      try {
        if (backoffMs > 0) {
          await sleep(backoffMs);
        }
        const headers = getAuthHeaders ? await getAuthHeaders() : {};
        const res = await fetch(docUrl(cfg, docPath), { signal: signal, headers: headers });
        if (res.status === 404) {
          backoffMs = 0;
          if (options.onHttpResponse) {
            options.onHttpResponse(res);
          }
          let httpDate = '';
          let httpDateReadable = false;
          try {
            httpDate = res.headers.get('date') || '';
            httpDateReadable = Boolean(httpDate);
          } catch (e) {
            httpDateReadable = false;
          }
          return { missing: true, httpDate: httpDate, httpDateReadable: httpDateReadable };
        }
        if (!res.ok) {
          throw new Error('Firestore GET ' + res.status);
        }
        const json = await res.json();
        backoffMs = 0;
        if (options.onHttpResponse) {
          options.onHttpResponse(res);
        }
        let httpDate = '';
        let httpDateReadable = false;
        try {
          httpDate = res.headers.get('date') || '';
          httpDateReadable = Boolean(httpDate);
        } catch (e) {
          httpDateReadable = false;
        }
        return {
          data: FV.decodeDocumentFields(json.fields),
          updateTime: json.updateTime || '',
          httpDate: httpDate,
          httpDateReadable: httpDateReadable,
        };
      } catch (err) {
        if (err && err.name === 'AbortError') {
          throw err;
        }
        backoffMs = Math.min(maxBackoff, backoffMs > 0 ? backoffMs * 2 : 1000);
        throw err;
      } finally {
        if (inflightByPath.get(pathKey) === controller) {
          inflightByPath.delete(pathKey);
        }
      }
    }

    /**
     * @param {string} docPath
     * @param {Record<string, unknown>} data
     * @param {string[]} fieldPaths
     * @returns {Promise<{ updateTime: string }>}
     */
    /**
     * @param {string} collectionPath
     */
    async function listDocuments(collectionPath) {
      const pathKey = 'list:' + collectionPath;
      const prev = inflightByPath.get(pathKey);
      if (prev) {
        prev.abort();
      }
      const controller = new AbortController();
      inflightByPath.set(pathKey, controller);
      const signal = controller.signal;
      try {
        const headers = getAuthHeaders ? await getAuthHeaders() : {};
        const url = baseUrl(cfg) + '/' + collectionPath.replace(/^\//, '');
        const res = await fetch(url, { signal: signal, headers: headers });
        if (!res.ok) {
          throw new Error('Firestore LIST ' + res.status);
        }
        const json = await res.json();
        const docs = Array.isArray(json.documents) ? json.documents : [];
        return docs.map(function (doc) {
          const name = doc.name || '';
          const id = name.split('/').pop() || '';
          return {
            id: id,
            data: FV.decodeDocumentFields(doc.fields),
            updateTime: doc.updateTime || '',
          };
        });
      } finally {
        if (inflightByPath.get(pathKey) === controller) {
          inflightByPath.delete(pathKey);
        }
      }
    }

    function destroy() {
      inflightByPath.forEach(function (c) {
        c.abort();
      });
      inflightByPath.clear();
    }

    return {
      getDocument: getDocument,
      listDocuments: listDocuments,
      destroy: destroy,
    };
  }

  QMS.Transport.FirestoreRest = {
    createFirestoreRestClient: createFirestoreRestClient,
    docUrl: docUrl,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
