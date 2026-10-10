'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadAnimModule() {
  const sandbox = { globalThis: {}, window: null, document: null };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim-config.js'), 'utf8'),
    sandbox,
  );
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'board', 'milksha-board-anim.js'), 'utf8'), sandbox);
  return sandbox.QMS.MilkshaBoardAnim;
}

function layoutPageGrid(items, page, pageSize) {
  const start = page * pageSize;
  const slice = items.slice(start, start + pageSize);
  const cells = new Array(pageSize).fill(null);
  for (let i = 0; i < slice.length; i += 1) {
    cells[i] = slice[i];
  }
  return cells;
}

function makeStyle() {
  return {};
}

function makeEl(tag, className) {
  const el = {
    tagName: tag.toUpperCase(),
    className: className || '',
    classList: {
      _c: new Set((className || '').split(/\s+/).filter(Boolean)),
      add: function (c) {
        this._c.add(c);
        el.className = [...this._c].join(' ');
      },
      remove: function (c) {
        this._c.delete(c);
        el.className = [...this._c].join(' ');
      },
      contains: function (c) {
        return this._c.has(c);
      },
    },
    style: makeStyle(),
    children: [],
    parentNode: null,
    innerHTML: '',
    attrs: {},
    setAttribute: function (k, v) {
      this.attrs[k] = v;
    },
    getAttribute: function (k) {
      return this.attrs[k];
    },
    removeAttribute: function (k) {
      delete this.attrs[k];
    },
    appendChild: function (child) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild: function (child) {
      const i = this.children.indexOf(child);
      if (i >= 0) {
        this.children.splice(i, 1);
        child.parentNode = null;
      }
      return child;
    },
    querySelector: function (sel) {
      const all = this.querySelectorAll(sel);
      return all.length ? all[0] : null;
    },
    querySelectorAll: function (sel) {
      const out = [];
      const self = this;
      function matches(el) {
        if (sel === '.milksha-zone-numbers') {
          return el.classList.contains('milksha-zone-numbers');
        }
        if (sel === '.milksha-num-cell') {
          return el.classList.contains('milksha-num-cell');
        }
        if (sel === '.milksha-board-chip[data-item-id]') {
          return el.classList.contains('milksha-board-chip');
        }
        if (sel === '.milksha-board-chip') {
          return el.classList.contains('milksha-board-chip');
        }
        if (sel === '.milksha-board-chip--layer-float') {
          return el.classList.contains('milksha-board-chip--layer-float');
        }
        return false;
      }
      function walk(n) {
        if (!n || !n.children) {
          return;
        }
        for (let i = 0; i < n.children.length; i += 1) {
          const c = n.children[i];
          if (matches(c)) {
            out.push(c);
          }
          walk(c);
        }
      }
      if (matches(self)) {
        out.push(self);
      }
      walk(self);
      return out;
    },
    getBoundingClientRect: function () {
      const idx = this._slotIndex || 0;
      return { left: 0, top: idx * 50, width: 120, height: 40, right: 120, bottom: idx * 50 + 40 };
    },
    _text: '',
    get textContent() {
      if (this._text) {
        return this._text;
      }
      let t = '';
      for (let i = 0; i < this.children.length; i += 1) {
        t += this.children[i].textContent || '';
      }
      return t;
    },
    set textContent(v) {
      this._text = String(v);
    },
    animate: function () {
      const anim = { onfinish: null, oncancel: null };
      setImmediate(function () {
        if (anim.onfinish) {
          anim.onfinish();
        }
      });
      return anim;
    },
    getAnimations: function () {
      return [];
    },
  };
  return el;
}

function buildZone(pageSize) {
  const zone = makeEl('div', 'milksha-zone prep');
  const layer = makeEl('div', 'milksha-zone-numbers');
  zone.appendChild(layer);
  for (let i = 0; i < pageSize; i += 1) {
    const slot = makeEl('div', 'milksha-num-cell');
    slot._slotIndex = i;
    layer.appendChild(slot);
  }
  return { zone: zone, layer: layer };
}

function seedChip(layer, slotIndex, id, number) {
  const slot = layer.querySelectorAll('.milksha-num-cell')[slotIndex];
  const chip = makeEl('div', 'milksha-board-chip');
  chip.setAttribute('data-item-id', id);
  const span = makeEl('span', 'milksha-num');
  span.textContent = number;
  chip.appendChild(span);
  chip.style.opacity = '1';
  slot.appendChild(chip);
  return chip;
}

function cellViolations(layer) {
  const bad = [];
  const slots = layer.querySelectorAll('.milksha-num-cell');
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    const chips = slot.querySelectorAll('.milksha-board-chip[data-item-id]');
    const text = slot.textContent.replace(/\s/g, '');
    if (chips.length > 1 || (text && !/^\d{1,4}$/.test(text))) {
      bad.push({ slot: i, chips: chips.length, text: text });
    }
  }
  return bad;
}

test('syncZone: slot replacement during fade-out keeps one chip per cell', async function () {
  const Anim = loadAnimModule();
  const pageSize = 10;
  const doc = { createElement: function (tag) {
    return makeEl(tag, tag === 'div' ? 'milksha-board-chip' : '');
  } };
  const win = {
    requestAnimationFrame: function (fn) {
      fn();
    },
    performance: { now: function () { return 0; } },
  };
  const animator = Anim.createBoardAnimator({
    document: doc,
    window: win,
    pageSize: pageSize,
    layoutPageGrid: layoutPageGrid,
    pageCountForItems: function () {
      return 1;
    },
  });

  const { zone, layer } = buildZone(pageSize);
  seedChip(layer, 0, 'store:2025', '2025');
  seedChip(layer, 1, 'store:2022', '2022');

  const prev = [
    { id: 'store:2025', number: '2025' },
    { id: 'store:2022', number: '2022' },
  ];
  const next = [
    { id: 'store:2039', number: '2039' },
    { id: 'store:2038', number: '2038' },
  ];

  const animDone = animator.syncZone(zone, 'prep', next, 0, { prevItems: prev, prevPage: 0 });
  const badMid = cellViolations(layer);
  assert.equal(badMid.length, 0, 'mid-sync glued cells: ' + JSON.stringify(badMid));
  await animDone;
  const badEnd = cellViolations(layer);
  assert.equal(badEnd.length, 0, JSON.stringify(badEnd));
});

test('syncZone: interrupted page turn hard-rebuilds slots', async function () {
  const Anim = loadAnimModule();
  const pageSize = 10;
  const doc = {
    createElement: function (tag) {
      return makeEl(tag, tag === 'div' ? 'milksha-board-chip' : '');
    },
  };
  const win = {
    requestAnimationFrame: function (fn) {
      fn();
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    performance: { now: function () { return 0; } },
  };
  const animator = Anim.createBoardAnimator({
    document: doc,
    window: win,
    pageSize: pageSize,
    layoutPageGrid: layoutPageGrid,
    pageCountForItems: function () {
      return 2;
    },
  });
  const { zone, layer } = buildZone(pageSize);
  layer.setAttribute('data-page-turn-anim', '1');
  seedChip(layer, 0, 'store:1111', '1111');
  seedChip(layer, 1, 'store:2222', '2222');
  const prev = [{ id: 'store:1111', number: '1111' }, { id: 'store:2222', number: '2222' }];
  const next = [{ id: 'store:3333', number: '3333' }];
  await animator.syncZone(zone, 'prep', next, 1, { prevItems: prev, prevPage: 0, pageTurn: false });
  const bad = cellViolations(layer);
  assert.equal(bad.length, 0, JSON.stringify(bad));
  assert.ok(!layer.getAttribute('data-page-turn-anim'));
});

test('formatOrderNo from store simulation never exceeds 4 digits', function () {
  const sandbox = { globalThis: {}, window: null };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'controller/store-simulation.js'), 'utf8'), sandbox);
  const Sim = sandbox.QMS.Controller.StoreSimulation;
  for (let n = 1; n <= 9999; n += 137) {
    const s = Sim.formatOrderNo(n);
    assert.match(s, /^\d{4}$/);
  }
});
