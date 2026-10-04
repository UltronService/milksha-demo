'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadRingHost() {
  const sandbox = {
    window: {},
    document: {
      getElementById: function () {
        return null;
      },
      createElement: function () {
        return {
          id: '',
          style: {},
          setAttribute: function () {},
          innerHTML: '',
        };
      },
      body: { appendChild: function () {} },
    },
    setTimeout: function (fn) {
      fn();
    },
    __rcvTelemetry: { ringCount: 0, ringEvents: [] },
  };
  let ctxConstructs = 0;
  class FakeCtx {
    constructor() {
      ctxConstructs += 1;
      this.state = 'running';
      this.currentTime = 0;
      this.destination = {};
    }
    createOscillator() {
      return {
        frequency: { value: 0 },
        connect: function () {},
        start: function () {},
        stop: function () {},
      };
    }
    createGain() {
      return {
        gain: { value: 0 },
        connect: function () {},
      };
    }
    resume() {
      return Promise.resolve();
    }
  }
  sandbox.window = sandbox;
  sandbox.AudioContext = FakeCtx;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/receiver/ring-host.js'), 'utf8'), sandbox);
  return { RingHost: sandbox.QMS.Receiver.RingHost, ctxConstructs: function () {
    return ctxConstructs;
  } };
}

test('twelve simultaneous chimes reuse one AudioContext', function () {
  const { RingHost, ctxConstructs } = loadRingHost();
  RingHost._resetAudioContextForTests();
  for (let i = 0; i < 12; i += 1) {
    RingHost.playReadyRing(String(9000 + i));
  }
  assert.equal(RingHost.getAudioContextCreateCount(), 1);
  assert.equal(ctxConstructs(), 1);
});
