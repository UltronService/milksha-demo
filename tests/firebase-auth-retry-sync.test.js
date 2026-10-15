'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

test('retryFirebaseAuthSync signs in after prior network failure', async function () {
  let signInCalls = 0;
  const sandbox = {
    globalThis: {},
    window: {},
    console: { warn: function () {} },
    firebase: {
      apps: [],
      app: function () {
        return {};
      },
      initializeApp: function () {
        this.apps.push({});
      },
      auth: function () {
        const self = {
          currentUser: null,
          signInWithCustomToken: async function () {
            signInCalls += 1;
            self.currentUser = { uid: 'device' };
          },
        };
        return self;
      },
      firestore: function () {
        return {};
      },
    },
  };
  sandbox.firebase = sandbox.firebase || null;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.globalThis.firebase = sandbox.firebase;
  sandbox.window.firebase = sandbox.firebase;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/transport/firebase-sdk-bridge.js'), 'utf8'), sandbox);
  const Bridge = sandbox.QMS.Transport.FirebaseSdkBridge;
  const session = {
    ensureIdToken: async function () {
      return 'rest-token';
    },
    devLogin: async function () {
      return 'custom-token-abc';
    },
  };
  const config = { apiKey: 'k', projectId: 'milksha-qms-dev' };
  const ok = await Bridge.retryFirebaseAuthSync(config, session);
  assert.equal(ok, true);
  assert.equal(signInCalls, 1);
  assert.equal(Bridge.getLastAuthSyncError(), null);
});
