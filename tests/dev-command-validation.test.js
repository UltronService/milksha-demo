'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { join } = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 18792;

function loadBrowserDevCmd() {
  const sandbox = { globalThis: {}, TextEncoder };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, 'js/transport/dev-command-validation.js'), 'utf8'),
    sandbox,
  );
  return sandbox.QMS.Transport.DevCommandValidation;
}

async function waitHealth() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('fake-cloud not up');
}

test('devCommand validation matches fake-cloud module', async function () {
  const browser = loadBrowserDevCmd();
  const node = await import('../tools/fake-cloud/dev-command-validation.mjs');
  const cases = [
    { storeId: 's120030', deviceId: 'stb-01', type: 'restore', params: {} },
    { storeId: 's120030', deviceId: 'stb-01', type: 'slow', params: { delayMs: 3000 } },
    { storeId: 's120030', deviceId: 'stb-01', type: 'slow', params: { delayMs: 60000 } },
    { storeId: 's120030', deviceId: 'bad id', type: 'restore', params: {} },
    { storeId: 's120030', deviceId: 'stb-01', type: 'restore', params: { delayMs: 1 } },
    { storeId: 's120030', deviceId: 'stb-01', type: 'slow', params: { delayMs: 60001 } },
    { storeId: 's120030', deviceId: 'stb-01', type: 'slow', params: { delayMs: 1.5 } },
    {
      storeId: 's120030',
      deviceId: 'stb-01',
      type: 'push_numbers',
      params: {
        ready: [{ no: '1234', sourceType: 'From_Store_OK' }],
        preparing: [{ no: '091', sourceType: 'From_milksha_point_Preparing' }],
      },
    },
  ];
  const sentAtVariants = [
    {},
    { sentAtMs: 1_700_000_000_000 },
    { sentAtMs: 0 },
  ];
  for (const c of cases) {
    for (const extra of sentAtVariants) {
      const input = { ...c, ...extra };
      const b = browser.buildDevCommandRequest(input);
      const n = node.buildDevCommandRequest(input);
      assert.equal(b.ok, n.ok);
      if (b.ok) {
        assert.equal(JSON.stringify(b.body), JSON.stringify(n.body));
      }
    }
  }
});

const SENT_AT_MS_MSG = 'sentAtMs 必須為非負整數毫秒';

test('sentAtMs module rules (fake-cloud matches browser buildDevCommandRequest)', async function () {
  const browser = loadBrowserDevCmd();
  const node = await import('../tools/fake-cloud/dev-command-validation.mjs');
  const base = { storeId: 's120030', deviceId: 'stb-01', type: 'restore', params: {} };

  const a1 = browser.buildDevCommandRequest(base);
  assert.equal(a1.ok, true);
  assert.equal(a1.body.sentAtMs, undefined);
  assert.equal(node.buildDevCommandRequest(base).ok, true);
  assert.equal(node.buildDevCommandRequest(base).body.sentAtMs, undefined);

  const ms = 1_700_000_012_345;
  const a2b = browser.buildDevCommandRequest({ ...base, sentAtMs: ms });
  const a2n = node.buildDevCommandRequest({ ...base, sentAtMs: ms });
  assert.equal(a2b.ok, true);
  assert.equal(a2b.body.sentAtMs, ms);
  assert.equal(a2n.body.sentAtMs, ms);

  const a3 = node.buildDevCommandRequest({
    storeId: 's120030',
    deviceId: 'stb-01',
    type: 'clear_now',
    params: {},
    sentAtMs: 1,
  });
  assert.equal(a3.ok, true);
  assert.equal(a3.body.sentAtMs, 1);

  const nullOmit = browser.buildDevCommandRequest({ ...base, sentAtMs: null });
  assert.equal(nullOmit.ok, true);
  assert.equal(nullOmit.body.sentAtMs, undefined);
  assert.equal(node.buildDevCommandRequest({ ...base, sentAtMs: null }).body.sentAtMs, undefined);

  for (const bad of ['x', 1.5, NaN, -1]) {
    const br = browser.buildDevCommandRequest({ ...base, sentAtMs: bad });
    const nr = node.buildDevCommandRequest({ ...base, sentAtMs: bad });
    assert.equal(br.ok, false);
    assert.equal(nr.ok, false);
    assert.equal(br.code, 'invalid_command_params');
    assert.equal(nr.code, 'invalid_command_params');
    assert.equal(br.message, SENT_AT_MS_MSG);
    assert.equal(nr.message, SENT_AT_MS_MSG);
  }

  assert.equal(browser.buildDevCommandRequest({ ...base, sentAtMs: 0 }).ok, true);
  assert.equal(node.buildDevCommandRequest({ ...base, sentAtMs: 0 }).body.sentAtMs, 0);
  const dec = node.buildDevCommandRequest({ ...base, sentAtMs: 1.5 });
  assert.equal(dec.ok, false);
  assert.equal(dec.message, SENT_AT_MS_MSG);

  const extra = node.buildDevCommandRequest({ ...base, sentAtMs: 1, rogue: true });
  assert.equal(extra.ok, false);
  assert.equal(extra.code, 'invalid_command_params');

  const badParams = node.buildDevCommandRequest({
    storeId: 's120030',
    deviceId: 'stb-01',
    type: 'slow',
    params: { delayMs: 70000 },
    sentAtMs: 100,
  });
  assert.equal(badParams.ok, false);
});

test('validateDevCommandBody browser vs node same ok/code (no sentAtMs in body)', function () {
  const browser = loadBrowserDevCmd();
  const cases = [
    { storeId: 's120030', deviceId: 'stb-01', type: 'restore', params: {} },
    { storeId: 's120030', deviceId: 'bad id', type: 'restore', params: {} },
    { storeId: '', deviceId: 'stb-01', type: 'restore', params: {} },
    { storeId: 's120030', deviceId: 'stb-01', type: 'nope', params: {} },
  ];
  return import('../tools/fake-cloud/dev-command-validation.mjs').then(function (node) {
    for (const body of cases) {
      const b = browser.validateDevCommandBody(body);
      const n = node.validateDevCommandBody(body);
      assert.equal(b.ok, n.ok);
      if (!b.ok) {
        assert.equal(b.code, n.code);
      }
    }
  });
});

test('controller-shaped push_numbers with sentAtMs validates in fake-cloud', async function () {
  const node = await import('../tools/fake-cloud/dev-command-validation.mjs');
  const sentAtMs = 1_700_000_040_000;
  const built = node.buildDevCommandRequest({
    storeId: 'zz-qa-push-store',
    deviceId: 'zz-qa-device',
    type: 'push_numbers',
    params: { ready: ['1001'], preparing: ['2001'] },
    sentAtMs,
  });
  assert.equal(built.ok, true);
  assert.equal(built.body.sentAtMs, sentAtMs);
});

test('fake-cloud devCommand accepts valid sentAtMs (HTTP)', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    const sentAtMs = 1_700_000_050_000;
    const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({
        storeId: 's120030',
        deviceId: 'stb-01',
        type: 'reload',
        params: {},
        sentAtMs,
      }),
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.ok, true);
  } finally {
    proc.kill();
  }
});

test('fake-cloud devCommand rejects bad sentAtMs (HTTP)', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    for (const sentAtMs of [-1, 'x']) {
      const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
        body: JSON.stringify({
          storeId: 's120030',
          deviceId: 'stb-01',
          type: 'restore',
          params: {},
          sentAtMs,
        }),
      });
      assert.equal(res.status, 400);
      const json = await res.json();
      assert.equal(json.code, 'invalid_command_params');
    }
  } finally {
    proc.kill();
  }
});

test('fake-cloud devCommand rejects extra top-level key with sentAtMs present (HTTP)', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({
        storeId: 's120030',
        deviceId: 'stb-01',
        type: 'restore',
        params: {},
        sentAtMs: 1,
        extra: true,
      }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, 'invalid_command_params');
  } finally {
    proc.kill();
  }
});

test('fake-cloud push_numbers with sentAtMs bumps board seq (HTTP)', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    let seqBefore = 0;
    const boardBefore = await fetch(
      `http://127.0.0.1:${PORT}/v1/projects/milksha-qms-dev/databases/(default)/documents/stores/s120030/board/today_board`,
      { headers: { Authorization: 'Bearer fake-id-token' } },
    );
    if (boardBefore.ok) {
      const beforeDoc = await boardBefore.json();
      seqBefore = beforeDoc.fields?.seq?.integerValue
        ? parseInt(beforeDoc.fields.seq.integerValue, 10)
        : 0;
    }

    const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({
        storeId: 's120030',
        deviceId: 'stb-01',
        type: 'push_numbers',
        params: { ready: ['9001'], preparing: [] },
        sentAtMs: 1_700_000_060_000,
      }),
    });
    assert.equal(res.status, 200);

    const boardAfter = await fetch(
      `http://127.0.0.1:${PORT}/v1/projects/milksha-qms-dev/databases/(default)/documents/stores/s120030/board/today_board`,
      { headers: { Authorization: 'Bearer fake-id-token' } },
    );
    const afterDoc = await boardAfter.json();
    const seqAfter = parseInt(afterDoc.fields.seq.integerValue, 10);
    assert.ok(seqAfter > seqBefore);
    const tickets = afterDoc.fields.tickets?.arrayValue?.values || [];
    assert.ok(tickets.length >= 1);
  } finally {
    proc.kill();
  }
});

test('fake-cloud devCommand returns 404 when device unknown', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({
        storeId: 's120030',
        deviceId: 'stb-99',
        type: 'restore',
        params: {},
      }),
    });
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.match(json.message, /device not found/i);
    assert.equal(json.dedupKey, undefined);
  } finally {
    proc.kill();
  }
});

test('clampTimingMs bounds 0..60000', function () {
  const Dev = loadBrowserDevCmd();
  assert.equal(Dev.clampTimingMs(-5), 0);
  assert.equal(Dev.clampTimingMs(999999), 60000);
  assert.equal(Dev.clampTimingMs(3000.6), 3001);
});

test('invalid_device_id returns 400 from fake-cloud', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({
        storeId: 's120030',
        deviceId: 'bad id',
        type: 'restore',
        params: {},
      }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, 'invalid_device_id');
    assert.equal(json.error, undefined);
  } finally {
    proc.kill();
  }
});

test('boxHeartbeat extra field returns invalid_body from fake-cloud', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/boxHeartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({
        storeId: 's120030',
        deviceId: 'stb-01',
        appVersion: 'x',
        boardSeq: 0,
        pendingUploads: 0,
        simulatedOffline: false,
        extra: true,
      }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, 'invalid_body');
    assert.equal(json.error, undefined);
  } finally {
    proc.kill();
  }
});

test('boxUpload missing posPayload returns invalid_body', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/boxUpload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({ storeId: 's120030', deviceId: 'stb-01' }),
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.code, 'invalid_body');
    assert.equal(json.error, undefined);
  } finally {
    proc.kill();
  }
});

test('devCommand mismatched store id returns 403 forbidden', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake-s120030-controller',
      },
      body: JSON.stringify({
        storeId: 's999999',
        deviceId: 'stb-01',
        type: 'restore',
        params: {},
      }),
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'forbidden');
  } finally {
    proc.kill();
  }
});

test('fake-cloud devCommand stores issuedAt as ISO timestamp string', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    const cmdRes = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({ storeId: 's120030', deviceId: 'stb-01', type: 'reload', params: {} }),
    });
    assert.equal(cmdRes.status, 200);
    const docRes = await fetch(
      `http://127.0.0.1:${PORT}/v1/projects/milksha-qms-dev/databases/(default)/documents/stores/s120030/devices/stb-01`,
      { headers: { Authorization: 'Bearer fake-id-token' } },
    );
    const doc = await docRes.json();
    const issued = doc.fields.pendingCommand.mapValue.fields.issuedAt.stringValue;
    assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(issued));
    assert.equal(doc.fields.pendingCommand.mapValue.fields.issuedAtMs, undefined);
  } finally {
    proc.kill();
  }
});

test('boxHeartbeat ack clears pendingCommand when clearOnAck enabled', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    await fetch(`http://127.0.0.1:${PORT}/test/pendingCommandMode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearOnAck: true }),
    });
    const cmdRes = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({ storeId: 's120030', deviceId: 'stb-01', type: 'reload', params: {} }),
    });
    assert.equal(cmdRes.status, 200);
    const cmdJson = await cmdRes.json();
    const hbRes = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/boxHeartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
      body: JSON.stringify({
        storeId: 's120030',
        deviceId: 'stb-01',
        appVersion: 'test',
        boardSeq: 0,
        pendingUploads: 0,
        simulatedOffline: false,
        ackCommandId: cmdJson.commandId,
      }),
    });
    assert.equal(hbRes.status, 200);
    const docRes = await fetch(
      `http://127.0.0.1:${PORT}/v1/projects/milksha-qms-dev/databases/(default)/documents/stores/s120030/devices/stb-01`,
      { headers: { Authorization: 'Bearer fake-id-token' } },
    );
    const doc = await docRes.json();
    const fields = doc.fields || {};
    const pc = fields.pendingCommand;
    const cleared =
      pc === undefined || (pc && typeof pc === 'object' && 'nullValue' in pc && pc.nullValue === null);
    assert.equal(cleared, true);
  } finally {
    proc.kill();
  }
});

test('forbidden token returns 403 on devCommand', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    const res = await fetch(`http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/devCommand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer forbidden-test-token' },
      body: JSON.stringify({
        storeId: 's120030',
        deviceId: 'stb-01',
        type: 'restore',
        params: {},
      }),
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'forbidden');
    assert.equal(json.error, undefined);
  } finally {
    proc.kill();
  }
});

test('delayMs over 60000 is invalid_command_params', function () {
  const Dev = loadBrowserDevCmd();
  const r = Dev.buildDevCommandRequest({
    storeId: 's120030',
    deviceId: 'stb-01',
    type: 'slow',
    params: { delayMs: 70000 },
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'invalid_command_params');
});

test('deviceId regex accepts stb-01 and rejects spaces', function () {
  const Dev = loadBrowserDevCmd();
  assert.equal(Dev.validateDeviceId('stb-01').ok, true);
  assert.equal(Dev.validateDeviceId('bad space').ok, false);
});
