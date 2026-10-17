#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskVerdictInLog } from '../lib/mask-verdict.mjs';
import {
  assertMaskedSafeForJev,
  findVerdictLeaksInMaskedLog,
} from '../lib/assert-masked-for-jev.mjs';
import { evaluateQaLogForCompare, CHOICE_UNABLE } from '../lib/jev-compare-client.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = join(__dirname, '..');

const logsDir = process.env.JEV_QA_LOGS_DIR ?? '/tmp/jev-qa-logs';
const answerKeyPath =
  process.env.JEV_ANSWER_KEY_PATH ?? join(toolRoot, 'fixtures/answer-key-26.json');
const outDir = process.env.JEV_COMPARE_RESULTS_DIR ?? join(toolRoot, 'results');

const LABELS = ['通過', '不通過', CHOICE_UNABLE];

function listCases() {
  return readdirSync(logsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^case-\d{3}$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function loadAnswerKey() {
  const raw = JSON.parse(readFileSync(answerKeyPath, 'utf8'));
  return raw.cases ?? raw;
}

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

/**
 * @param {Record<string, string>} keyByCase
 * @param {Array<{ case: string, key: string, jev: string }>} rows
 */
function buildConfusion(keyByCase, rows) {
  const matrix = {};
  for (const k of LABELS) {
    matrix[k] = {};
    for (const j of LABELS) {
      matrix[k][j] = 0;
    }
  }
  for (const r of rows) {
    const key = keyByCase[r.case] ?? r.answer_key ?? r.key;
    const jev = r.jev_answer ?? r.jev;
    if (matrix[key] && matrix[key][jev] !== undefined) {
      matrix[key][jev] += 1;
    }
  }
  return matrix;
}

/**
 * @param {string} key
 * @param {string} jev
 */
function mismatchReason(key, jev) {
  if (jev === CHOICE_UNABLE) {
    return 'jev 選無法判斷，標籤有明確通過/不通過';
  }
  if (key === '通過' && jev === '不通過') {
    return 'jev 判不通過，標籤為通過';
  }
  if (key === '不通過' && jev === '通過') {
    return 'jev 判通過，標籤為不通過';
  }
  return 'jev 與標籤不一致';
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const answerKey = loadAnswerKey();
  const cases = listCases();
  const resultRows = [];
  let totalInputTokens = 0;

  for (const caseId of cases) {
    const expected = answerKey[caseId];
    if (!expected) {
      throw new Error(`answer key missing ${caseId}`);
    }

    const rawLog = readFileSync(join(logsDir, caseId, 'log.txt'), 'utf8');
    let { masked } = maskVerdictInLog(rawLog);
    const leaks = findVerdictLeaksInMaskedLog(masked);
    if (leaks.length > 0) {
      masked = masked
        .replace(/\bPASS\b/gi, '[MASKED]')
        .replace(/\bFAIL\b/gi, '[MASKED]')
        .replace(/NEEDS\s+FIX(?:ES)?/gi, '[MASKED]');
      assertMaskedSafeForJev(masked);
    } else {
      assertMaskedSafeForJev(masked);
    }

    let jev = '';
    let confidence = 0;
    let error = '';
    try {
      const { choice, confidence: conf, usage } = await evaluateQaLogForCompare({
        state: masked,
      });
      jev = choice;
      confidence = conf;
      totalInputTokens += usage.input_tokens ?? 0;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      error = error.replaceAll(process.env.JEV_API_KEY ?? '', '<REDACTED>');
    }

    const match = !error && jev === expected;
    resultRows.push({
      case: caseId,
      answer_key: expected,
      jev_answer: jev,
      confidence,
      match,
      error,
      mismatch_reason: match || error ? '' : mismatchReason(expected, jev),
    });
    process.stderr.write(`${caseId} ${jev || 'ERR'}\n`);
  }

  const decided = resultRows.filter((r) => !r.error);
  const matches = decided.filter((r) => r.match).length;
  const accuracy = decided.length ? matches / decided.length : 0;
  const unableCount = decided.filter((r) => r.jev_answer === CHOICE_UNABLE).length;
  const confusion = buildConfusion(answerKey, resultRows);

  const summary = {
    generated_at_utc: new Date().toISOString(),
    case_count: resultRows.length,
    api_errors: resultRows.filter((r) => r.error).length,
    accuracy_vs_answer_key: accuracy,
    match_count: matches,
    unable_count: unableCount,
    answer_key_path: answerKeyPath,
    logs_dir: logsDir,
    confusion_matrix_rows_answer_key: confusion,
    usage_input_tokens: totalInputTokens,
  };

  const header =
    'case,answer_key,jev_answer,confidence,match,mismatch_reason,error';
  const csvLines = [
    header,
    ...resultRows.map((r) =>
      [
        r.case,
        r.answer_key,
        r.jev_answer,
        r.confidence,
        r.match,
        r.mismatch_reason,
        r.error,
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ];

  writeFileSync(join(outDir, 'jev-answer-key-compare.csv'), `${csvLines.join('\n')}\n`, 'utf8');
  writeFileSync(
    join(outDir, 'jev-answer-key-compare.json'),
    `${JSON.stringify({ summary, rows: resultRows }, null, 2)}\n`,
    'utf8',
  );

  const md = [
    '# jev vs 答案鍵（26 案）',
    '',
    `| 指標 | 值 |`,
    `|------|-----|`,
    `| 準確率（與答案鍵完全一致） | ${(accuracy * 100).toFixed(1)}%（${matches}/${decided.length}） |`,
    `| 無法判斷 | ${unableCount} |`,
    `| API 錯誤 | ${summary.api_errors} |`,
    '',
    '## 混淆矩陣（列＝答案鍵，行＝jev）',
    '',
    '| 答案鍵 \\\\ jev | 通過 | 不通過 | 無法判斷 |',
    '|-------------|-----:|------:|--------:|',
    ...LABELS.map(
      (key) =>
        `| ${key} | ${confusion[key]['通過']} | ${confusion[key]['不通過']} | ${confusion[key][CHOICE_UNABLE]} |`,
    ),
    '',
    '## 不一致案例',
    '',
    ...resultRows
      .filter((r) => !r.match && !r.error)
      .map((r) => `- **${r.case}**：${r.mismatch_reason}`),
  ];

  writeFileSync(join(outDir, 'jev-answer-key-compare.md'), `${md.join('\n')}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  const safe = msg.replaceAll(process.env.JEV_API_KEY ?? '', '<REDACTED>');
  console.error(safe);
  process.exit(1);
});
