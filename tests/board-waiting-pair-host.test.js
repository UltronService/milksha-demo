'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatWaitingPairLine } = require('./helpers/waiting-pair-contract.js');
const { loadWaitingPairHostModule } = require('./helpers/load-waiting-pair-module.js');

function memoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
    removeItem(k) {
      map.delete(k);
    },
  };
}

test('item 1: renderWaitingOverlay centers exact waiting line', function () {
  const Host = loadWaitingPairHostModule();
  const doc = {
    body: { appendChild: () => {} },
    getElementById: () => null,
    createElement: () => ({
      id: '',
      className: '',
      textContent: '',
      style: {},
      classList: { add: () => {}, remove: () => {} },
      setAttribute: () => {},
    }),
  };
  const el = Host.ensureWaitingOverlay(doc);
  Host.renderWaitingOverlay(el, { displayStoreId: 's999998' });
  assert.equal(el.textContent, formatWaitingPairLine('s999998'));
});

test('item 5: waiting overlay state hides bind hint and board zones flags', function () {
  const Host = loadWaitingPairHostModule();
  const flags = Host.computeBoardChromeVisibility({ mode: 'waiting' });
  assert.equal(flags.showReadyZone, false);
  assert.equal(flags.showPreparingZone, false);
  assert.equal(flags.showBindHint, false);
});

test('item 7: renderWaitingOverlay assigns textContent not innerHTML for malicious store', function () {
  const Host = loadWaitingPairHostModule();
  const el = {
    textContent: '',
    innerHTML: 'safe',
  };
  Host.renderWaitingOverlay(el, { displayStoreId: '<img onerror=1>' });
  assert.equal(el.innerHTML, 'safe');
  assert.match(el.textContent, /店編號/);
});
