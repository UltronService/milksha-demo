'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadChipOverflowFit() {
  const sandbox = {
    console: console,
    document: {
      createElement: function () {
        return {
          getContext: function () {
            return {
              font: '',
              measureText: function (text) {
                return { width: text.length * 42 };
              },
            };
          },
        };
      },
    },
    getComputedStyle: function () {
      return { getPropertyValue: function () { return '70px'; } };
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js', 'board', 'chip-overflow-fit.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Board.ChipOverflowFit;
}

test('computeFitScale: one-step ratio, floor at 0.75', function () {
  const F = loadChipOverflowFit();
  assert.equal(F.computeFitScale(400, 300).scale, 1);
  const mid = F.computeFitScale(300, 400);
  assert.equal(mid.scale, 0.75);
  assert.equal(mid.stillOverflows, false);
  const clamped = F.computeFitScale(200, 400);
  assert.equal(clamped.scale, 0.75);
  assert.equal(clamped.stillOverflows, true);
});

test('getScaleInvocationCount tracks applyBoardOverflowFit calls', function () {
  const F = loadChipOverflowFit();
  F.resetScaleInvocationCount();
  assert.equal(F.getScaleInvocationCount(), 0);
  F.applyBoardOverflowFit(null);
  assert.equal(F.getScaleInvocationCount(), 0);
});

test('naturalContentWidthPx grows with longer numbers', function () {
  const F = loadChipOverflowFit();
  const short = F.naturalContentWidthPx('1234', 70);
  const long = F.naturalContentWidthPx('WWWWWW', 70);
  assert.ok(long > short);
});
