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
    const homeBoard = options.homeBoard === true;

    function resolveActiveStoreId() {
      const Coord = QMS.Transport.LocalPocCoord;
      if (Coord && homeBoard) {
        return Coord.resolveLocalDeviceContext(storage, {
          homeBoard: true,
          fallbackStoreId: storeId,
          fallbackDeviceId: options.deviceId || 'stb-01',
        }).storeId;
      }
      return storeId;
    }

    function resolveActiveDeviceId() {
      const Coord = QMS.Transport.LocalPocCoord;
      if (Coord && homeBoard) {
        return Coord.resolveLocalDeviceContext(storage, {
          homeBoard: true,
          fallbackStoreId: storeId,
          fallbackDeviceId: options.deviceId || 'stb-01',
        }).deviceId;
      }
      return options.deviceId || 'stb-01';
    }

    const channelName = CHANNEL_PREFIX + resolveActiveStoreId();
    let channel = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(channelName);
    }

    function broadcast(msg) {
      if (channel) {
        channel.postMessage(msg);
      }
    }

    const Validate = QMS.Receiver && QMS.Receiver.Validate;
    const boundStore = Validate ? Validate.findStore(storeId) : null;
    const shim = QMS.Transport.createLocalCloudShim({
      storeId: storeId,
      storage: storage,
      config: config,
      broadcast: broadcast,
      boundTarget: boundStore ? boundStore.target : '',
      resolveStoreId: resolveActiveStoreId,
      resolveDeviceId: resolveActiveDeviceId,
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
    cloudApi.boxHeartbeat = shim.api.boxHeartbeat;
    cloudApi.devCommand = shim.api.devCommand;
    cloudApi.posReceiver = shim.api.posReceiver;

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
      readReceiveLogs: shim.readReceiveLogs,
      readCommands: shim.readCommands,
      debugSetBoard: shim.debugSetBoard,
      destroy: destroy,
    };
  }

  QMS.Transport.Local = {
    createLocalTransport: createLocalTransport,
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
