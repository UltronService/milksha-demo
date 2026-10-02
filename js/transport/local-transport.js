/**
 * Local mode transport (same today_board + device docs as Firestore).
 */
(function (root) {
  'use strict';

  const QMS = (root.QMS = root.QMS || {});
  QMS.Transport = QMS.Transport || {};

  const CHANNEL_PREFIX = 'milksha-transport:';

  function createLocalTransport(options) {
    const storeId = options.storeId;
    const storage = options.storage || root.localStorage;
    const config = options.config || {};
    const channelName = CHANNEL_PREFIX + storeId;
    let channel = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(channelName);
    }

    function broadcast(msg) {
      if (channel) {
        channel.postMessage(msg);
      }
    }

    const shim = QMS.Transport.createLocalCloudShim({
      storeId: storeId,
      storage: storage,
      config: config,
      broadcast: broadcast,
    });

    const session = {
      ensureIdToken: async function () {
        return 'local-id-token';
      },
      authHeaders: async function () {
        return { Authorization: 'Bearer local-id-token' };
      },
    };

    const cloudApi = QMS.Transport.createCloudApi(config, session);
    cloudApi.heartbeat = shim.api.heartbeat;
    cloudApi.devCommand = shim.api.devCommand;
    cloudApi.posIngest = shim.api.posIngest;

    function destroy() {
      if (channel) {
        channel.close();
        channel = null;
      }
    }

    return {
      mode: 'local',
      paths: shim.paths,
      cloudApi: cloudApi,
      session: session,
      readBoard: shim.readBoard,
      readDevice: shim.readDevice,
      listDevices: shim.listDevices,
      readLogs: shim.readLogs,
      destroy: destroy,
    };
  }

  QMS.Transport.Local = {
    createLocalTransport: createLocalTransport,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
