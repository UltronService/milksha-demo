'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const PORT = 18789;

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

test('fake-cloud clears stale businessDate board on read', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    await fetch(`http://127.0.0.1:${PORT}/test/seed-board`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: 's120030',
        businessDate: '2020-01-01',
        tickets: [{ no: '1', status: 'ready', updatedAt: '2020-01-01T00:00:00.000Z' }],
      }),
    });
    const boardPath =
      '/v1/projects/milksha-qms-dev/databases/(default)/documents/stores/s120030/board/today_board';
    const res = await fetch(`http://127.0.0.1:${PORT}${boardPath}`, {
      headers: { Authorization: 'Bearer fake' },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const tickets = json.fields?.tickets?.arrayValue?.values || [];
    assert.equal(tickets.length, 0);
  } finally {
    proc.kill();
  }
});

test('fake-cloud boxHeartbeat returns 404 for unknown device', async function () {
  const proc = spawn(process.execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitHealth();
    await fetch(`http://127.0.0.1:${PORT}/test/reset`, { method: 'POST' });
    const res = await fetch(
      `http://127.0.0.1:${PORT}/fn/milksha-qms-dev/asia-east1/boxHeartbeat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake-id-token',
        },
        body: JSON.stringify({
          storeId: 's120030',
          deviceId: 'missing-stb',
          appVersion: 'test',
          boardSeq: 0,
          pendingUploads: 0,
        }),
      },
    );
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.equal(json.code, 'device_not_found');
    assert.equal(json.error, undefined);
  } finally {
    proc.kill();
  }
});
