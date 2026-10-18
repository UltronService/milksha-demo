import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = execSync('git diff --name-only origin/main -- tests/e2e/*.spec.mjs', { cwd: root, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

const allowedHelpers = new Set([
  'clickControllerDevButton',
  'clickControllerDevButtonByTestId',
  'fillControllerDevField',
  'selectControllerDevField',
  'expandControllerZone',
]);

const violations = [];

for (const rel of files) {
  const diff = execSync(`git diff origin/main -- "${rel}"`, { cwd: root, encoding: 'utf8' });
  const removed = diff.match(/^-[^-].*$/gm) || [];
  const added = diff.match(/^\+[^+].*$/gm) || [];
  const norm = (line) => line.replace(/^[-+]\s*/, '').trim();
  const paired = new Map();
  for (const r of removed) {
    const n = norm(r);
    if (n.startsWith('import ') || n === '' || n.startsWith('//')) continue;
    paired.set(n, (paired.get(n) || 0) + 1);
  }
  for (const a of added) {
    const n = norm(a);
    if (n.startsWith('import ') || n === '' || n.startsWith('//')) continue;
    const count = paired.get(n);
    if (count) {
      paired.set(n, count - 1);
      if (paired.get(n) === 0) paired.delete(n);
      continue;
    }
    const isHelperOnly =
      [...allowedHelpers].some((h) => n.includes(h)) ||
      /^await expandControllerZone\(/.test(n);
    const isImportShuffle = n.includes("from './harness.mjs'");
    if (!isHelperOnly && !isImportShuffle) {
      violations.push({ rel, line: n });
    }
  }
  for (const [line] of paired) {
    const isOldInteraction =
      /\.click\('#/.test(line) ||
      /\.click\('\[data-testid=/.test(line) ||
      /\.fill\('#fld-/.test(line) ||
      /\.selectOption\('#fld-/.test(line);
    if (!isOldInteraction) {
      violations.push({ rel, line: `unpaired removal: ${line}` });
    }
  }
}

if (violations.length) {
  console.error(JSON.stringify({ ok: false, violations }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, specFiles: files.length, files }, null, 2));
