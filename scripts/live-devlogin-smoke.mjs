#!/usr/bin/env node
/**
 * Live milksha-qms-dev devLogin smoke (Node fetch; no writes).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FN = 'https://asia-east1-milksha-qms-dev.cloudfunctions.net/devLogin';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'pr24-self-qa');

const STORES = ['c030020', 'zz-qa-store-a', 'zz-qa-store-b', 's999999'];

async function probe(storeId) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, role: 'device', deviceId: 'stb-01' }),
  });
  const json = await res.json().catch(() => ({}));
  return { storeId, status: res.status, code: json.code || null, ok: res.ok };
}

async function main() {
  const results = [];
  for (const storeId of STORES) {
    results.push(await probe(storeId));
  }
  const report = { at: new Date().toISOString(), fn: FN, results };
  mkdirSync(ART, { recursive: true });
  const out = join(ART, 'live-devlogin-smoke.json');
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const c03 = results.find((r) => r.storeId === 'c030020');
  const qaA = results.find((r) => r.storeId === 'zz-qa-store-a');
  const qaB = results.find((r) => r.storeId === 'zz-qa-store-b');
  const denied = results.find((r) => r.storeId === 's999999');
  if (!c03?.ok || !qaA?.ok || !qaB?.ok || denied?.ok) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
