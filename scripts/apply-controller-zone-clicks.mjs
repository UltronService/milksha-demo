import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const e2eDir = join(root, 'tests/e2e');
const specs = globSync('**/*.spec.mjs', { cwd: e2eDir }).map((f) => join(e2eDir, f));

const helperNames = [
  'clickControllerDevButton',
  'clickControllerDevButtonByTestId',
  'fillControllerDevField',
  'selectControllerDevField',
];

const replacements = [
  [/await (\w+)\.click\('\[data-testid="btn-send-numbers"]'\);/g, 'await clickControllerDevButtonByTestId($1, \'btn-send-numbers\');'],
  [/await (\w+)\.click\("\[data-testid=\"btn-send-numbers\"\]"\);/g, 'await clickControllerDevButtonByTestId($1, \'btn-send-numbers\');'],
  [/await (\w+)\.click\('\[data-testid="(btn-[^"]+)"]'\);/g, 'await clickControllerDevButtonByTestId($1, \'$2\');'],
  [/await (\w+)\.click\("\[data-testid=\"(btn-[^\"]+)\"\]"\);/g, 'await clickControllerDevButtonByTestId($1, \'$2\');'],
  [/await (\w+)\.click\('#(btn-[^']+)'\);/g, 'await clickControllerDevButton($1, \'$2\');'],
  [/await (\w+)\.fill\('#(fld-[^']+)',\s*([^)]+)\);/g, 'await fillControllerDevField($1, \'$2\', $3);'],
  [/await (\w+)\.selectOption\('#(fld-[^']+)',\s*([^)]+)\);/g, 'await selectControllerDevField($1, \'$2\', $3);'],
  [
    /await (\w+)\.locator\('\[data-testid="zone-toggle-pos"]'\)\.click\(\);\s*\n\s*await \1\.click\('\[data-testid="(btn-[^"]+)"\]'\);/g,
    'await clickControllerDevButtonByTestId($1, \'$2\');',
  ],
  [
    /await (\w+)\.locator\('\[data-testid="zone-toggle-pos"]'\)\.click\(\);\s*\n\s*await clickControllerDevButtonByTestId\(\1, '(btn-[^']+)'\);/g,
    'await clickControllerDevButtonByTestId($1, \'$2\');',
  ],
];

for (const path of specs) {
  if (path.includes('controller-zone-expand-guard')) {
    continue;
  }
  let src = readFileSync(path, 'utf8');
  let changed = false;
  for (const [re, rep] of replacements) {
    const next = src.replace(re, rep);
    if (next !== src) {
      src = next;
      changed = true;
    }
  }
  if (!changed) {
    continue;
  }
  const used = helperNames.filter((h) => src.includes(h));
  if (used.length === 0) {
    continue;
  }
  if (!src.includes("from './harness.mjs'") && !src.includes('from "./harness.mjs"')) {
    continue;
  }
  const importRe = /import \{([^}]+)\} from '\.\/harness\.mjs';/;
  const m = src.match(importRe);
  if (!m) {
    continue;
  }
  const existing = m[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const h of used) {
    if (!existing.includes(h)) {
      existing.push(h);
    }
  }
  existing.sort();
  src = src.replace(importRe, `import { ${existing.join(', ')} } from './harness.mjs';`);
  writeFileSync(path, src);
  console.log('updated', path.replace(root + '/', ''));
}
