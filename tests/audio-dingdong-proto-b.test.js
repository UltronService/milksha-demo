'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

const DING_HZ = 659.25;
const DONG_HZ = 523.25;
const DING_DURATION_S = 0.7;
const DONG_DURATION_S = 1.0;
const DONG_OFFSET_S = 0.3;
const PEAK_LIMIT = 0.95;
const ATTACK_S = 0.02;
const GAIN_FLOOR = 0.001;
const SR = 48_000;

/**
 * @param {{ muted?: boolean }} [options]
 * @returns {Promise<{ freq: number, startTime: number, stopTime: number, peak: number }[]>}
 */
async function playDingDongAndRecord(options) {
  /** @type {{ freq: number, startTime: number, stopTime: number, peak: number }[]} */
  const tones = [];

  function MockAudioContext() {
    const ctx = this;
    this.currentTime = 100;
    this.state = 'running';
    this.destination = {};
    this.resume = function resume() {
      return Promise.resolve();
    };
    this.createOscillator = function createOscillator() {
      const osc = {
        type: '',
        frequency: {
          _value: 0,
          setValueAtTime: function setValueAtTime(value) {
            osc.frequency._value = value;
          },
        },
        _startTime: 0,
        _stopTime: 0,
        connect: function connect(gainNode) {
          gainNode._osc = osc;
          osc._gain = gainNode;
        },
        start: function start(when) {
          osc._startTime = when;
        },
        stop: function stop(when) {
          osc._stopTime = when;
          if (osc._gain && typeof osc._gain._commit === 'function') {
            osc._gain._commit();
          }
        },
      };
      return osc;
    };
    this.createGain = function createGain() {
      const gainNode = {
        _peak: 0,
        _osc: null,
        _committed: false,
        gain: {
          setValueAtTime: function setValueAtTime() {},
          linearRampToValueAtTime: function linearRampToValueAtTime(value) {
            gainNode._peak = value;
          },
          exponentialRampToValueAtTime: function exponentialRampToValueAtTime() {},
        },
        connect: function connect() {},
        _commit: function commit() {
          if (gainNode._committed || !gainNode._osc) {
            return;
          }
          gainNode._committed = true;
          tones.push({
            freq: gainNode._osc.frequency._value,
            startTime: gainNode._osc._startTime,
            stopTime: gainNode._osc._stopTime,
            peak: gainNode._peak,
          });
        },
      };
      return gainNode;
    };
  }

  const sandbox = {
    setTimeout: function setTimeout(fn) {
      fn();
      return 0;
    },
    clearTimeout: function clearTimeout() {},
    speechSynthesis: null,
    AudioContext: MockAudioContext,
    webkitAudioContext: MockAudioContext,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8'), sandbox);
  const manager = sandbox.QMS.createAudioManager({ muted: Boolean(options && options.muted) });
  await manager.playDingDong();
  return tones;
}

function toneGainEnvelope(tLocal, duration, peak) {
  if (tLocal < 0 || tLocal >= duration) {
    return 0;
  }
  if (tLocal < ATTACK_S) {
    return peak * (tLocal / ATTACK_S);
  }
  const decayT = tLocal - ATTACK_S;
  const decayLen = duration - ATTACK_S;
  if (decayLen <= 0) {
    return peak;
  }
  return peak * (GAIN_FLOOR / peak) ** (decayT / decayLen);
}

function offlinePeakFromScheduled(tones) {
  if (tones.length === 0) {
    return 0;
  }
  const baseTime = tones[0].startTime;
  let maxEnd = baseTime;
  for (let i = 0; i < tones.length; i += 1) {
    if (tones[i].stopTime > maxEnd) {
      maxEnd = tones[i].stopTime;
    }
  }
  const lengthS = maxEnd - baseTime + 0.05;
  const n = Math.ceil(lengthS * SR);
  const twoPi = 2 * Math.PI;
  let peak = 0;
  for (let s = 0; s < n; s += 1) {
    const t = baseTime + s / SR;
    let sample = 0;
    for (let i = 0; i < tones.length; i += 1) {
      const tone = tones[i];
      const duration = tone.stopTime - tone.startTime;
      const tLocal = t - tone.startTime;
      const g = toneGainEnvelope(tLocal, duration, tone.peak);
      if (g === 0) {
        continue;
      }
      sample += Math.sin(twoPi * tone.freq * t) * g;
    }
    const a = Math.abs(sample);
    if (a > peak) {
      peak = a;
    }
  }
  return peak;
}

function fundamentalTones(tones) {
  return tones.filter(function (t) {
    return t.freq === DING_HZ || t.freq === DONG_HZ;
  });
}

test('formal-1 Proto B ding-dong fundamental frequencies unchanged', async function () {
  const scheduled = await playDingDongAndRecord({ muted: false });
  const fundamentals = fundamentalTones(scheduled);
  const freqs = fundamentals.map(function (t) {
    return t.freq;
  });
  assert.equal(fundamentals.length, 2);
  assert.ok(freqs.includes(DING_HZ));
  assert.ok(freqs.includes(DONG_HZ));
});

test('formal-2 Proto B note lengths and dong delay match spec', async function () {
  const scheduled = await playDingDongAndRecord({ muted: false });
  const fundamentals = fundamentalTones(scheduled);
  const ding = fundamentals.find(function (t) {
    return t.freq === DING_HZ;
  });
  const dong = fundamentals.find(function (t) {
    return t.freq === DONG_HZ;
  });
  assert.ok(ding);
  assert.ok(dong);
  const dingDur = ding.stopTime - ding.startTime;
  const dongDur = dong.stopTime - dong.startTime;
  const dongDelay = dong.startTime - ding.startTime;
  assert.ok(Math.abs(dingDur - DING_DURATION_S) < 0.0001);
  assert.ok(Math.abs(dongDur - DONG_DURATION_S) < 0.0001);
  assert.ok(Math.abs(dongDelay - DONG_OFFSET_S) < 0.0001);
});

test('formal-3 Proto B summed output peak does not exceed 0.95', async function () {
  const scheduled = await playDingDongAndRecord({ muted: false });
  const peak = offlinePeakFromScheduled(scheduled);
  assert.ok(peak <= PEAK_LIMIT + 0.0001, 'peak was ' + peak);
  assert.ok(peak > 0.85, 'expected normalized bright chime, peak was ' + peak);
});

test('formal-4 chime rules unchanged: newly ready only, max 3 per batch, muted skips ding', async function () {
  const chimeSandbox = { Set: Set, globalThis: null, window: null };
  chimeSandbox.globalThis = chimeSandbox;
  chimeSandbox.window = chimeSandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/receiver/chime-policy.js'), 'utf8'), chimeSandbox);
  const createPolicy = chimeSandbox.QMS.Receiver.createBoardChimePolicy;
  const policy = createPolicy({
    getBusinessDate: function getBusinessDate() {
      return '2026-11-26';
    },
    newlyReadyIds: function newlyReadyIds(prev, next) {
      const out = [];
      next.forEach(function (id) {
        if (!prev.has(id)) {
          out.push(id);
        }
      });
      return out;
    },
  });
  policy.pickRingIds(new Set(), new Set(['store:1']));
  assert.deepEqual(policy.pickRingIds(new Set(['store:1']), new Set(['store:1'])), []);
  assert.deepEqual(policy.pickRingIds(new Set(['store:1']), new Set(['store:1', 'store:2'])), ['store:2']);

  const boardSandbox = { Set: Set, globalThis: null, window: null };
  boardSandbox.globalThis = boardSandbox;
  boardSandbox.window = boardSandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/milksha-board.js'), 'utf8'), boardSandbox);
  const split = boardSandbox.QMS.MilkshaBoard.splitPopQueue(['a:1', 'a:2', 'a:3', 'a:4', 'a:5']);
  assert.deepEqual(split.popIds, ['a:1', 'a:2', 'a:3']);
  assert.equal(split.silentFreshIds.length, 2);

  const whenMuted = await playDingDongAndRecord({ muted: true });
  assert.equal(whenMuted.length, 0);
});