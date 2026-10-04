#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'tests'))
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => join('tests', name));

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status === null ? 1 : result.status);
