#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVerdictCarrierLine } from '../lib/strip-verdict-from-log.mjs';
import { REPORT_SECTION_MARKER } from '../lib/mask-verdict.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = join(__dirname, '..');
const logsRoot = process.env.JEV_QA_LOGS_DIR ?? join(toolRoot, 'qa-logs');

function listCases() {
  return readdirSync(logsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^case-\d{3}$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

const hits = [];
for (const caseId of listCases()) {
  const text = readFileSync(join(logsRoot, caseId, 'log.txt'), 'utf8');
  const idx = text.indexOf(REPORT_SECTION_MARKER);
  const report = idx === -1 ? '' : text.slice(idx + REPORT_SECTION_MARKER.length);
  for (const line of report.split('\n')) {
    if (isVerdictCarrierLine(line)) {
      hits.push({ case: caseId, line: line.trim().slice(0, 120) });
    }
  }
}

if (hits.length > 0) {
  console.error(JSON.stringify({ ok: false, hits }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, report_verdict_carrier_lines: 0 }, null, 2));
