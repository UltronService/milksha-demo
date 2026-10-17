#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactSensitive } from '../lib/redact-sensitive.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = join(__dirname, '..');
const logsRoot = process.env.JEV_QA_LOGS_DIR ?? join(toolRoot, 'qa-logs');
const patternsRaw = JSON.parse(
  readFileSync(join(toolRoot, 'fixtures/verdict-line-patterns.json'), 'utf8'),
);

/** @type {Record<string, string>} */
const patterns = Object.fromEntries(
  Object.entries(patternsRaw).filter(([k]) => k.startsWith('case-')),
);

function listCases() {
  return readdirSync(logsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^case-\d{3}$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

/**
 * @param {string} caseId
 * @param {string} text
 */
function stripVerdictLine(caseId, text) {
  const reSrc = patterns[caseId];
  if (!reSrc) {
    throw new Error(`no verdict pattern for ${caseId}`);
  }
  const re = new RegExp(reSrc);
  const lines = text.split('\n');
  let removed = 0;
  const out = [];
  for (const line of lines) {
    if (re.test(line)) {
      removed += 1;
      continue;
    }
    out.push(line);
  }
  if (removed !== 1) {
    throw new Error(`${caseId}: expected to remove 1 verdict line, removed ${removed}`);
  }
  return out.join('\n');
}

/**
 * @param {string} caseDir
 */
function scrubMeta(caseDir) {
  const metaPath = join(caseDir, 'meta.json');
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  delete meta.qa_verdict;
  delete meta.verdict_source;
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 1)}\n`, 'utf8');
}

for (const caseId of listCases()) {
  const caseDir = join(logsRoot, caseId);
  const logPath = join(caseDir, 'log.txt');
  let text = readFileSync(logPath, 'utf8');
  text = stripVerdictLine(caseId, text);
  text = redactSensitive(text);
  writeFileSync(logPath, text, 'utf8');
  scrubMeta(caseDir);
  process.stderr.write(`${caseId} stripped\n`);
}

console.log('ok');
