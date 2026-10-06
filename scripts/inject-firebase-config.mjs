#!/usr/bin/env node
/**
 * Overwrite bundled Firebase demo fields in config/firebase.js at deploy time (GitHub Actions secrets).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const target = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'firebase.js');

const apiKey = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
const posSignSecret = String(process.env.MILKSHA_DEV_POS_SIGN_SECRET || '').trim();

if (!apiKey && !posSignSecret) {
  console.log('inject-firebase-config: no secrets set, leaving bundled defaults');
  process.exit(0);
}

let text = readFileSync(target, 'utf8');

function replaceField(name, value) {
  if (!value) {
    return;
  }
  const re = new RegExp(`(${name}:\\s*)'[^']*'`);
  if (!re.test(text)) {
    throw new Error(`inject-firebase-config: field ${name} not found in ${target}`);
  }
  const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  text = text.replace(re, `$1'${escaped}'`);
}

replaceField('apiKey', apiKey);
replaceField('posSignSecret', posSignSecret);

writeFileSync(target, text);
console.log('inject-firebase-config: updated', target);
