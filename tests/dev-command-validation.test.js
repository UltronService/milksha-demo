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
  ];
  for (const c of cases) {
    const b = browser.buildDevCommandRequest(c);
    const n = node.buildDevCommandRequest(c);
    assert.equal(b.ok, n.ok);
    if (b.ok) {
      assert.equal(JSON.stringify(b.body), JSON.stringify(n.body));
    }
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
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fake-id-token' },
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
