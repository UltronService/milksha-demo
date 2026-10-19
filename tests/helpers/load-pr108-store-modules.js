'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

/**
 * Loads PR #108 modules when present (post-merge or after rebase onto #108).
 * @returns {{ StoreId: object, HomeBoardStore: object } | null}
 */
function loadPr108StoreModules() {
  const storeIdPath = path.join(ROOT, 'js', 'store-id.js');
  const homePath = path.join(ROOT, 'js', 'receiver', 'home-board-store.js');
  if (!fs.existsSync(storeIdPath) || !fs.existsSync(homePath)) {
    return null;
  }
  const sandbox = { globalThis: {}, QMS: {}, URLSearchParams };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(storeIdPath, 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(homePath, 'utf8'), sandbox);
  return {
    StoreId: sandbox.QMS.StoreId,
    HomeBoardStore: sandbox.QMS.Receiver.HomeBoardStore,
  };
}

module.exports = {
  loadPr108StoreModules,
  PR108_STORE_ID_PATH: path.join(ROOT, 'js', 'store-id.js'),
  PR108_HOME_BOARD_STORE_PATH: path.join(ROOT, 'js', 'receiver', 'home-board-store.js'),
};
