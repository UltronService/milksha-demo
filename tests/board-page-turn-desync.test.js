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
    style: {},
    children: [],
    parentNode: null,
    _innerHTML: '',
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(v) {
      this._innerHTML = String(v);
      this.children = [];
    },
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
      function matches(node) {
        if (sel === '.milksha-zone-numbers') {
          return node.classList.contains('milksha-zone-numbers');
        }
        if (sel === '.milksha-num-cell') {
          return node.classList.contains('milksha-num-cell');
        }
        if (sel === '.milksha-board-chip[data-item-id]') {
          return node.classList.contains('milksha-board-chip');
        }
        if (sel === '.milksha-board-chip') {
          return node.classList.contains('milksha-board-chip');
        }
        if (sel === '.milksha-board-chip--layer-float') {
          return node.classList.contains('milksha-board-chip--layer-float');
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
      walk(this);
      return out;
    },
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 120, height: 40, right: 120, bottom: 40 };
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
    closest: function () {
      return null;
    },
  };
  return el;
}

function buildZone(pageSize) {
  const zone = makeEl('div', 'milksha-zone prep');
  const layer = makeEl('div', 'milksha-zone-numbers');
  zone.appendChild(layer);
  for (let i = 0; i < pageSize; i += 1) {
    layer.appendChild(makeEl('div', 'milksha-num-cell'));
  }
  return { zone, layer };
}

function seedChip(layer, slotIndex, id, number) {
  const slot = layer.querySelectorAll('.milksha-num-cell')[slotIndex];
  const chip = makeEl('div', 'milksha-board-chip');
  chip.setAttribute('data-item-id', id);
  const span = makeEl('span', 'milksha-num');
  span.textContent = number;
  chip.appendChild(span);
  slot.appendChild(chip);
}

test('syncZone pageTurn: stale DOM after cancelled turn hard-rebuilds target page', async function () {
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
    performance: { now: function () {
      return 0;
    } },
  };
  const animator = Anim.createBoardAnimator({
    document: doc,
    window: win,
    pageSize: pageSize,
    layoutPageGrid: layoutPageGrid,
    pageCountForItems: function () {
      return 3;
    },
  });
  const { zone, layer } = buildZone(pageSize);
  const prevItems = [];
  for (let i = 19; i >= 0; i -= 1) {
    prevItems.push({ id: 'store:' + (4100 + i), number: String(4100 + i) });
  }
  for (let s = 0; s < pageSize; s += 1) {
    const it = prevItems[pageSize + s];
    if (it) {
      seedChip(layer, s, it.id, it.number);
    }
  }
  layer.setAttribute('data-page-turn-anim', '1');
  const nextItems = [{ id: 'store:4120', number: '4120' }].concat(prevItems);
  await animator.syncZone(zone, 'ready', nextItems, 0, {
    prevItems: prevItems,
    prevPage: 0,
    pageTurn: true,
  });
  let blob = '';
  for (let i = 0; i < pageSize; i += 1) {
    const slot = layer.querySelectorAll('.milksha-num-cell')[i];
    const chip = slot.querySelector('.milksha-board-chip[data-item-id]');
    if (chip) {
      blob += chip.innerHTML || '';
    }
  }
  assert.ok(blob.indexOf('4120') >= 0, 'target page 0 must show newest 4120 after stale DOM page turn');
});

test('syncZone pageTurn: dual DOM mismatch hard-rebuilds without starting page-turn fade', async function () {
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
    performance: {
      now: function () {
        return 0;
      },
    },
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
  const items = [];
  for (let i = 0; i < 15; i += 1) {
    items.push({ id: 'store:' + (5000 + i), number: String(5000 + i) });
  }
  await animator.syncZone(zone, 'prep', items, 1, {
    prevItems: items,
    prevPage: 0,
    pageTurn: true,
  });
  assert.notEqual(layer.getAttribute('data-page-turn-anim'), '1');
  const firstId = items[pageSize].id;
  const chip = layer.querySelector('.milksha-board-chip[data-item-id]');
  assert.equal(chip && chip.getAttribute('data-item-id'), firstId);
});

test('syncZone pageTurn: domShowsPrevPage false skips fade and rebuilds target page', async function () {
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
    performance: {
      now: function () {
        return 0;
      },
    },
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
  const items = [];
  for (let i = 0; i < 15; i += 1) {
    items.push({ id: 'store:' + (5000 + i), number: String(5000 + i) });
  }
  for (let s = 0; s < pageSize; s += 1) {
    const it = items[pageSize + s];
    if (it) {
      seedChip(layer, s, it.id, it.number);
    }
  }
  await animator.syncZone(zone, 'prep', items, 1, {
    prevItems: items,
    prevPage: 0,
    pageTurn: true,
  });
  assert.notEqual(layer.getAttribute('data-page-turn-anim'), '1');
  const chip = layer.querySelector('.milksha-board-chip[data-item-id]');
  assert.equal(chip && chip.getAttribute('data-item-id'), items[pageSize].id);
});
