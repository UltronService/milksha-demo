/**
 * Firestore read-only transport (Bearer required). Writes via CloudApi only.
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};
  const Paths = QMS.Transport.Paths;
  const Rest = QMS.Transport.FirestoreRest;
  const TodayBoard = QMS.Board.TodayBoard;

  /**
   * @param {object} options
   */
  function createFirestoreTransport(options) {
    const storeId = options.storeId;
    const config = options.config;
    const session = options.session;
    const client = Rest.createFirestoreRestClient({
      config: config,
      getAuthHeaders: function () {
        return session.authHeaders();
      },
    });
    const cloudApi = QMS.Transport.createCloudApi(config, session);

    const boardPath = Paths.todayBoardPath(storeId);

    async function readBoard() {
      const doc = await client.getDocument(boardPath);
      if (!doc) {
        return null;
      }
      const norm = TodayBoard.normalizeTodayBoard(doc.data);
      if (!norm.ok) {
        return null;
      }
      return {
        data: norm.board,
        updateTime: doc.updateTime || norm.board.updatedAt || '',
      };
    }

    async function readDevice(deviceId) {
      const doc = await client.getDocument(Paths.deviceDocPath(storeId, deviceId));
      if (!doc) {
        return null;
      }
      return { data: doc.data, updateTime: doc.updateTime || '' };
    }

    async function listDevices() {
      return client.listDocuments(Paths.devicesCollectionPath(storeId));
    }

    async function readLogs(limit) {
      const path = Paths.logsCollectionPath(config.logsCollectionPathTemplate, storeId);
      const docs = await client.listDocuments(path);
      if (typeof limit === 'number' && limit > 0) {
        return docs.slice(0, limit);
      }
      return docs;
    }

    function destroy() {
      client.destroy();
    }

    return {
      mode: 'firestore',
      paths: Paths,
      session: session,
      cloudApi: cloudApi,
      readBoard: readBoard,
      readDevice: readDevice,
      listDevices: listDevices,
      readLogs: readLogs,
      destroy: destroy,
    };
  }

  QMS.Transport.Firestore = {
    createFirestoreTransport: createFirestoreTransport,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
