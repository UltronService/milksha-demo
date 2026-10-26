'use strict';

/**
 * Regression: ready pulse must scale delivery icon-box in sync with .milksha-num; chip frame unchanged.
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

function wireControllableAnimations(host) {
  const anims = [];
  host.animate = function (keyframes, options) {
    host._lastKeyframes = keyframes;
    host._lastOptions = options;
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
    host._lastAnim = anim;
    return anim;
  };
  host.getAnimations = function () {
    return anims.filter((a) => !a._cancelled);
  };
  return host;
}

function makeDeliveryChipEl() {
  const iconBoxEl = wireControllableAnimations({
    style: { transform: '', transformOrigin: '' },
    getBoundingClientRect: function () {
      return { left: 20, right: 90, top: 54, bottom: 114, width: 70, height: 60 };
    },
  });
  const numEl = wireControllableAnimations({
    style: { transform: '', transformOrigin: '' },
    getBoundingClientRect: function () {
      return { left: 100, right: 200, top: 50, bottom: 118, width: 100, height: 68 };
    },
  });
  const el = wireControllableAnimations({
    classList: { contains: () => true },
    style: { opacity: '', transform: '', transformOrigin: '' },
    setAttribute: function () {},
    getAttribute: function () {
      return 'ready::fp:#6405';
    },
    querySelector: function (sel) {
      if (sel === '.milksha-num') {
        return numEl;
      }
      if (sel === '.milksha-board-icon-box') {
        return iconBoxEl;
      }
      return null;
    },
  });
  return { el, numEl, iconBoxEl };
}

function peakScaleFromKeyframes(keyframes) {
  const peak = keyframes.find((kf) => kf.transform && kf.transform.includes('scale(1.3)'));
  return peak ? 1.3 : null;
}

test('animateReadyPulse: icon-box uses same scale keyframes and transform-origin as .milksha-num', async function () {
  const Anim = loadAnimModule();
  const { el, numEl, iconBoxEl } = makeDeliveryChipEl();

  const done = Anim.animateReadyPulse(el, 1.3, 300, 3000, 300, 1, () => 1);

  assert.equal(numEl.style.transformOrigin, '10px 34px');
  assert.equal(iconBoxEl.style.transformOrigin, '90px 30px');
  assert.equal(peakScaleFromKeyframes(numEl._lastKeyframes), 1.3);
  assert.equal(peakScaleFromKeyframes(iconBoxEl._lastKeyframes), 1.3);
  assert.deepEqual(numEl._lastKeyframes, iconBoxEl._lastKeyframes);

  const opacityKf = el._lastKeyframes;
  assert.ok(opacityKf);
  assert.equal(opacityKf.some((kf) => kf.opacity === 0), true);
  assert.equal(el._lastKeyframes.some((kf) => kf.transform), false);

  el._lastAnim.cancel();
  await done;
  assert.equal(numEl.style.transform, '');
  assert.equal(iconBoxEl.style.transform, '');
});

test('animateReadyPulse: chip outer element must not receive scale transform animation', async function () {
  const Anim = loadAnimModule();
  const { el, numEl, iconBoxEl } = makeDeliveryChipEl();

  Anim.animateReadyPulse(el, 1.3, 100, 0, 0, 1, () => 1);

  assert.ok(numEl._lastKeyframes);
  assert.ok(iconBoxEl._lastKeyframes);
  const chipScale = (el._lastKeyframes || []).some((kf) => kf.transform !== undefined && kf.transform !== '');
  assert.equal(chipScale, false);
  assert.equal(el.style.transform, '');
});
