'use strict';

/**
 * Regression for ready-zone fade stuck (live multi-apply pattern).
 * Expected RED on main until animateReadyPulse snap-on-cancel lands.
 */
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

/** Element with controllable Web Animations cancel/finish. */
function makeControllableAnimEl() {
  const anims = [];
  const el = {
    classList: { contains: () => true },
    style: { opacity: '', transform: '', transformOrigin: '' },
    setAttribute: function () {},
    getAttribute: function () {
      return 'store:2001';
    },
    animate: function (_keyframes, _options) {
      const anim = {
        _cancelled: false,
        onfinish: null,
        oncancel: null,
        cancel: function () {
          if (this._cancelled) {
            return;
          }
          this._cancelled = true;
          if (anim.oncancel) {
            anim.oncancel();
          }
        },
        finish: function () {
          if (this._cancelled) {
            return;
          }
          if (anim.onfinish) {
            anim.onfinish();
          }
        },
      };
      anims.push(anim);
      el._lastAnim = anim;
      return anim;
    },
    getAnimations: function () {
      return anims.filter((a) => !a._cancelled);
    },
  };
  return el;
}

test('animateReadyPulse: cancelled pulse must leave opacity at 1', async function () {
  const Anim = loadAnimModule();
  let generation = 1;
  const getGeneration = () => generation;
  const el = makeControllableAnimEl();

  const done = Anim.animateReadyPulse(el, 1.3, 300, 3000, 300, 1, getGeneration);
  assert.equal(el.style.opacity, '0', 'pulse starts from transparent');

  el._lastAnim.cancel();
  await done;

  assert.equal(
    el.style.opacity,
    '1',
    'regression: cancelled ready pulse must snap opacity to 1 (main leaves inline 0)',
  );
});

test('animateReadyPulse: generation-invalidated finish must leave opacity at 1', async function () {
  const Anim = loadAnimModule();
  let generation = 1;
  const getGeneration = () => generation;
  const el = makeControllableAnimEl();

  const done = Anim.animateReadyPulse(el, 1.3, 50, 0, 0, 1, getGeneration);
  generation = 2;
  el._lastAnim.finish();
  await done;

  assert.equal(
    el.style.opacity,
    '1',
    'regression: invalidated finish must snap opacity to 1 (main leaves inline 0)',
  );
});

function layoutPageGrid(items, page, pageSize) {
  const start = page * pageSize;
  const slice = items.slice(start, start + pageSize);
  const cells = new Array(pageSize).fill(null);
  for (let i = 0; i < slice.length; i += 1) {
    cells[i] = slice[i];
  }
  return cells;
}

function makeDomEl(tag, className) {
  const anims = [];
  const el = {
    tagName: tag.toUpperCase(),
    className: className || '',
    classList: {
      _c: new Set((className || '').split(/\s+/).filter(Boolean)),
      add(c) {
        this._c.add(c);
        el.className = [...this._c].join(' ');
      },
      remove(c) {
        this._c.delete(c);
        el.className = [...this._c].join(' ');
      },
      contains(c) {
        return this._c.has(c);
      },
    },
    style: { opacity: '', transform: '', transformOrigin: '', willChange: '' },
    children: [],
    parentNode: null,
    innerHTML: '',
    attrs: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getAttribute(k) {
      return this.attrs[k];
    },
    appendChild(child) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) {
        this.children.splice(i, 1);
        child.parentNode = null;
      }
      return child;
    },
    closest(sel) {
      let n = this;
      while (n) {
        if (sel === '.milksha-board' && n.classList.contains('milksha-board')) {
          return n;
        }
        n = n.parentNode;
      }
      return null;
    },
    querySelector(sel) {
      const all = this.querySelectorAll(sel);
      return all.length ? all[0] : null;
    },
    querySelectorAll(sel) {
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
      if (matches(this)) {
        out.push(this);
      }
      walk(this);
      return out;
    },
    getBoundingClientRect() {
      const idx = this._slotIndex || 0;
      return { left: 0, top: idx * 50, width: 120, height: 40, right: 120, bottom: idx * 50 + 40 };
    },
    animate(keyframes, _options) {
      const anim = {
        _cancelled: false,
        onfinish: null,
        oncancel: null,
        cancel() {
          if (this._cancelled) {
            return;
          }
          this._cancelled = true;
          if (anim.oncancel) {
            anim.oncancel();
          }
        },
        finish() {
          if (this._cancelled) {
            return;
          }
          if (anim.onfinish) {
            anim.onfinish();
          }
        },
      };
      if (keyframes && keyframes[0] && keyframes[0].opacity !== undefined) {
        el.style.opacity = String(keyframes[0].opacity);
      }
      anims.push(anim);
      el._lastAnim = anim;
      return anim;
    },
    getAnimations() {
      return anims.filter((a) => !a._cancelled);
    },
  };
  return el;
}

function buildReadyZone(pageSize) {
  const board = makeDomEl('div', 'milksha-board');
  const zone = makeDomEl('div', 'milksha-zone ready');
  board.appendChild(zone);
  const layer = makeDomEl('div', 'milksha-zone-numbers');
  zone.appendChild(layer);
  for (let i = 0; i < pageSize; i += 1) {
    const slot = makeDomEl('div', 'milksha-num-cell');
    slot._slotIndex = i;
    layer.appendChild(slot);
  }
  return { board: board, zone: zone, layer: layer };
}

function findInCellChipById(layer, itemId) {
  const slots = layer.querySelectorAll('.milksha-num-cell');
  for (let i = 0; i < slots.length; i += 1) {
    const chip = slots[i].querySelector('.milksha-board-chip');
    if (chip && chip.getAttribute('data-item-id') === itemId) {
      return chip;
    }
  }
  return null;
}

test('syncZone: second ready before first pulse finishes leaves first chip opaque (live slide pattern)', async function () {
  const Anim = loadAnimModule();
  const pageSize = 10;
  const doc = {
    createElement(tag) {
      return makeDomEl(tag, tag === 'div' ? 'milksha-board-chip' : '');
    },
  };
  const win = {
    requestAnimationFrame(fn) {
      fn();
    },
    performance: { now: () => 0 },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
  const animator = Anim.createBoardAnimator({
    document: doc,
    window: win,
    pageSize: pageSize,
    layoutPageGrid: layoutPageGrid,
    pageCountForItems: () => 1,
  });

  const { zone, layer } = buildReadyZone(pageSize);
  const prev0 = [];
  const next1 = [{ id: 'store:2001', number: '2001' }];
  animator.syncZone(zone, 'ready', next1, 0, {
    prevItems: prev0,
    prevPage: 0,
    scalePulseIds: ['store:2001'],
  });
  await new Promise((r) => setImmediate(r));

  const next2 = [
    { id: 'store:2002', number: '2002' },
    { id: 'store:2001', number: '2001' },
  ];
  animator.syncZone(zone, 'ready', next2, 0, {
    prevItems: next1,
    prevPage: 0,
    scalePulseIds: ['store:2002'],
  });
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));

  try {
    const chip2001 = findInCellChipById(layer, 'store:2001');
    assert.ok(chip2001, '2001 chip should remain in a cell');
    assert.equal(
      chip2001.style.opacity,
      '1',
      'regression: chip interrupted by next ready pulse/FLIP must end opaque (main leaves 0)',
    );
  } finally {
    for (const chip of layer.querySelectorAll('.milksha-board-chip')) {
      const anim = chip._lastAnim;
      if (anim && !anim._cancelled) {
        anim.finish();
      }
    }
    await new Promise((r) => setImmediate(r));
  }
});
