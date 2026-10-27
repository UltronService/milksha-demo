'use strict';

/**
 * Board web build label: hidden on production Pages paths; visible on pr-preview only.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const BUILD_LABEL = 'TEST_BUILD_LABEL';

function runBoardAppAtPathname(pathname, search) {
  const appended = [];
  const body = { appendChild: function (el) {
    appended.push(el);
  } };
  const doc = {
    body,
    readyState: 'complete',
    addEventListener: function () {},
    querySelector: function (sel) {
      return appended.find((el) => el.className === sel.replace('.', '')) || null;
    },
    createElement: function () {
      const attrs = {};
      return {
        className: '',
        textContent: '',
        setAttribute: function (key, value) {
          attrs[key] = value;
        },
        getAttribute: function (key) {
          return attrs[key] ?? null;
        },
      };
    },
    getElementById: function () {
      return null;
    },
  };
  const sandbox = {
    console,
    document: doc,
    location: { pathname, search: search || '', hostname: 'ultronservice.github.io', protocol: 'https:' },
    MILKSHA_BOARD_WEB_BUILD_LABEL: BUILD_LABEL,
    QMS: {
      loadSiteBrand: function () {
        return Promise.resolve({ basePath: './' });
      },
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(APP_SRC, sandbox);
  return { doc, appended, sandbox };
}

test('production board paths do not mount .milksha-board-web-build', function () {
  const paths = [
    '/milksha-demo/',
    '/milksha-demo/index.html',
    '/milksha-demo/nested/board/',
    '/',
  ];
  for (const pathname of paths) {
    const { appended } = runBoardAppAtPathname(pathname, '?mode=cloud&store=zz-qa-store-a');
    const labelEl = appended.find((el) => el.className === 'milksha-board-web-build');
    assert.equal(labelEl, undefined, `expected no label at ${pathname}`);
  }
});

test('pr-preview paths mount .milksha-board-web-build with MILKSHA_BOARD_WEB_BUILD_LABEL', function () {
  const paths = [
    '/milksha-demo/pr-preview/pr-125/',
    '/milksha-demo/pr-preview/pr-125/index.html',
    '/pr-preview/pr-7',
    '/milksha-demo/pr-preview/pr-999/?mode=cloud&store=zz-qa-store-a',
  ];
  for (const pathname of paths) {
    const qIdx = pathname.indexOf('?');
    const cleanPath = qIdx >= 0 ? pathname.slice(0, qIdx) : pathname;
    const search = qIdx >= 0 ? pathname.slice(qIdx) : '?mode=cloud&store=zz-qa-store-a';
    const { appended } = runBoardAppAtPathname(cleanPath, search);
    const labelEl = appended.find((el) => el.className === 'milksha-board-web-build');
    assert.ok(labelEl, `expected label at ${pathname}`);
    assert.equal(labelEl.textContent, BUILD_LABEL);
    assert.equal(labelEl.getAttribute('aria-hidden'), 'true');
  }
});

test('non-preview paths resembling pr-preview without PR number do not mount label', function () {
  const paths = ['/milksha-demo/pr-preview/', '/milksha-demo/pr-preview/pr-abc/', '/pr-preview/pr-/'];
  for (const pathname of paths) {
    const { appended } = runBoardAppAtPathname(pathname);
    const labelEl = appended.find((el) => el.className === 'milksha-board-web-build');
    assert.equal(labelEl, undefined, `expected no label at ${pathname}`);
  }
});
