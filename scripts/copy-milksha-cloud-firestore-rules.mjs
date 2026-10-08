#!/usr/bin/env node
/**
 * Copy firestore.rules from a local milksha-cloud checkout (read-only).
 * Example: MILKSHA_CLOUD_ROOT=../milksha-cloud node scripts/copy-milksha-cloud-firestore-rules.mjs
 */
import { copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cloudRoot = String(process.env.MILKSHA_CLOUD_ROOT || '').trim();
if (!cloudRoot) {
  console.error('Set MILKSHA_CLOUD_ROOT to milksha-cloud repo path');
  process.exit(1);
}
const src = join(cloudRoot, 'firestore.rules');
const dest = join(root, 'tests', 'firestore-rules', 'firestore.rules');
if (!existsSync(src)) {
  console.error('Missing', src);
  process.exit(1);
}
copyFileSync(src, dest);
console.log('Copied', src, '->', dest);
