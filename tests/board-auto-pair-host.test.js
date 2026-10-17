'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

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
    clear() {
      map.clear();
    },
  };
}

function loadHostStack() {
  const sandbox = {
    globalThis: {},
    Date: Date,
    Intl: Intl,
    Promise: Promise,
    Error: Error,
    console: { warn: () => {} },
    crypto: { randomUUID: () => 'host-test-machine' },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const elements = new Map();
  function el(id, tag) {
    const node = {
      id,
      tagName: tag || 'DIV',
      className: '',
      hidden: false,
      style: { setProperty: () => {}, getPropertyValue: () => '88px' },
      classList: { add: () => {}, remove: () => {}, toggle: () => {} },
      setAttribute: () => {},
      querySelector(sel) {
        if (sel === '.milksha-board-bind-hint__name') {
          return nameSpan;
        }
        if (sel === '.milksha-board-bind-hint__suffix') {
          return suffixSpan;
        }
        return null;
      },
      appendChild(child) {
        elements.set(child.id, child);
      },
    };
    return node;
  }
  const nameSpan = { textContent: '' };
  const suffixSpan = { textContent: '', classList: { add: () => {}, remove: () => {} } };
  const hintEl = el('milksha-board-bind-hint');
  hintEl.querySelector = function (sel) {
    if (sel === '.milksha-board-bind-hint__name') {
      return nameSpan;
    }
    if (sel === '.milksha-board-bind-hint__suffix') {
      return suffixSpan;
    }
    return null;
  };
  const canvas = el('milksha-board-canvas');
  canvas.appendChild = function (child) {
    elements.set(child.id, child);
  };
  const boardRoot = el('board-root');
  sandbox.document = {
    getElementById(id) {
      if (id === 'milksha-board-bind-hint') {
        return elements.get(id) || hintEl;
      }
      if (id === 'milksha-board-canvas') {
        return canvas;
      }
      if (id === 'board-root') {
        return boardRoot;
      }
      return elements.get(id) || null;
    },
    createElement() {
      return el('dynamic');
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'today-board.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'board-auto-pair.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'board-auto-pair-host.js'), 'utf8'), sandbox);
  sandbox.QMS.Transport = {
    BoardBindApi: {
      requestBoardBind: async function () {
        throw new Error('bind should not run');
      },
    },
  };
  return { sandbox, nameSpan, suffixSpan, hintEl };
}

function startHostWithHint(sandbox, clockStartMs) {
  const AP = sandbox.QMS.Board.AutoPair;
  const local = memoryStorage();
  const session = memoryStorage();
  AP.writeBindRecord(local, {
    brandId: 'milksha',
    storeId: 's1',
    machineId: 'm1',
    storeName: '店',
    storeNumber: 's1',
  });
  AP.markBindHintSessionActive(local, session);
  let clockMs = clockStartMs;
  const timers = [];
  let nextId = 1;
  const win = sandbox.window;
  win.localStorage = local;
  win.sessionStorage = session;
  win.__milkshaBoardAutoPairController = null;
  win.setTimeout = function (fn, wait) {
    const id = nextId++;
    timers.push({ id, fn, at: clockMs + wait });
    return id;
  };
  win.clearTimeout = function (id) {
    for (let i = 0; i < timers.length; i += 1) {
      if (timers[i].id === id) {
        timers.splice(i, 1);
        break;
      }
    }
  };
  win.addEventListener = function () {};
  const Host = sandbox.QMS.Board.AutoPairHost;
  Host.startBoardAutoPair({
    window: win,
    document: sandbox.document,
    localStorage: local,
    sessionStorage: session,
    brandId: 'milksha',
    storeId: 's1',
    cloudApi: {},
    now: function () {
      return new Date(clockMs);
    },
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
  });
  function advance(ms) {
    clockMs += ms;
    const due = timers.filter(function (t) {
      return t.at <= clockMs;
    });
    timers.length = 0;
    for (let i = 0; i < due.length; i += 1) {
      due[i].fn();
    }
    const rest = timers;
    return { clockMs, fired: due.length };
  }
  return { suffixSpan: null, advance, getSuffixText: () => sandbox.document.getElementById('milksha-board-bind-hint') };
}

test('host minute timer updates suffix only on Taipei minute boundary', function () {
  const { sandbox } = loadHostStack();
  const taipei1459 = Date.parse('2026-10-17T06:29:45.000Z');
  const local = memoryStorage();
  const session = memoryStorage();
  const AP = sandbox.QMS.Board.AutoPair;
  AP.writeBindRecord(local, {
    brandId: 'milksha',
    storeId: 's1',
    machineId: 'm1',
    storeName: '店',
    storeNumber: 's1',
  });
  AP.markBindHintSessionActive(local, session);
  let clockMs = taipei1459;
  const timers = [];
  let nextId = 1;
  const win = sandbox.window;
  win.localStorage = local;
  win.sessionStorage = session;
  win.__milkshaBoardAutoPairController = null;
  win.setTimeout = function (fn, wait) {
    const id = nextId++;
    timers.push({ id, fn, at: clockMs + wait, wait });
    return id;
  };
  win.clearTimeout = function (id) {
    for (let i = 0; i < timers.length; i += 1) {
      if (timers[i].id === id) {
        timers.splice(i, 1);
        break;
      }
    }
  };
  win.addEventListener = function () {};
  const hint = sandbox.document.getElementById('milksha-board-bind-hint');
  sandbox.QMS.Board.AutoPairHost.startBoardAutoPair({
    window: win,
    document: sandbox.document,
    brandId: 'milksha',
    storeId: 's1',
    cloudApi: {},
    now: function () {
      return new Date(clockMs);
    },
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
  });
  const suffixEl = hint.querySelector('.milksha-board-bind-hint__suffix');
  assert.match(suffixEl.textContent, /14:29$/);
  clockMs += 10_000;
  assert.match(suffixEl.textContent, /14:29$/);
  const wait = AP.msUntilNextTaipeiMinute(new Date(clockMs));
  clockMs += wait + 5;
  const due = timers.filter(function (t) {
    return t.at <= clockMs;
  });
  for (let i = 0; i < due.length; i += 1) {
    due[i].fn();
  }
  assert.match(suffixEl.textContent, /14:30$/);
});

test('warnBindFailedOnce logs at most once per window boot', function () {
  const { sandbox } = loadHostStack();
  let warns = 0;
  sandbox.console.warn = function () {
    warns += 1;
  };
  const Host = sandbox.QMS.Board.AutoPairHost;
  const err = new Error('fail');
  Host.warnBindFailedOnce(sandbox.window, err);
  Host.warnBindFailedOnce(sandbox.window, err);
  assert.equal(warns, 1);
});
