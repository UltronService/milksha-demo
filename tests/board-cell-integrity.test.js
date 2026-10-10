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
    querySelector: function () {
      return null;
    },
    querySelectorAll: function (sel) {
      const out = [];
      function walk(n) {
        if (!n || !n.children) {
          return;
        }
        for (let i = 0; i < n.children.length; i += 1) {
          const c = n.children[i];
          if (sel === '.milksha-zone-numbers' && c.classList.contains('milksha-zone-numbers')) {
            out.push(c);
          }
          if (sel === '.milksha-num-cell' && c.classList.contains('milksha-num-cell')) {
            out.push(c);
          }
          if (sel === '.milksha-board-chip[data-item-id]' && c.classList.contains('milksha-board-chip')) {
            out.push(c);
          }
          walk(c);
        }
      }
      walk(this);
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

  await animator.syncZone(zone, 'prep', next, 0, { prevItems: prev, prevPage: 0 });

  const bad = cellViolations(layer);
  assert.equal(bad.length, 0, JSON.stringify(bad));
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
