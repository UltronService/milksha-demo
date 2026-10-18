import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const logDir = process.argv[2] || '/tmp/main-baseline-16shard-logs';
const files = readdirSync(logDir).filter((f) => f.startsWith('shard-') && f.endsWith('.log'));

const failures = new Set();
const shardFailCounts = {};

for (const file of files) {
  const shard = file.replace('shard-', '').replace('.log', '');
  const text = readFileSync(join(logDir, file), 'utf8');
  const m = text.match(/(\d+) failed/);
  shardFailCounts[shard] = m ? Number(m[1]) : 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (/spec\.mjs:\d+:\d+ ›/.test(t) && !t.startsWith('at ')) {
      const cleaned = t.replace(/^\d+\)\s*/, '');
      failures.add(cleaned);
    }
    if (/^\d+\) .*spec\.mjs:\d+:\d+ ›/.test(t)) {
      failures.add(t.replace(/^\d+\)\s*/, '').trim());
    }
  }
}

const out = {
  logDir,
  shardFailCounts,
  totalUniqueFailures: failures.size,
  failures: [...failures].sort(),
};
const dest = join(process.cwd(), 'artifacts/ci-nightly/main-baseline-16shard-parsed.json');
writeFileSync(dest, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ totalUniqueFailures: out.totalUniqueFailures, shards: Object.keys(shardFailCounts).length }, null, 2));
