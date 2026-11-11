#!/usr/bin/env node
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskVerdictInLog } from '../lib/mask-verdict.mjs';
import { evaluateQaLogState, estimateInputCostUsd } from '../lib/jev-client.mjs';
import { evaluateJevChoice, computeMatch } from '../lib/evaluate-verdict.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const toolRoot = join(__dirname, '..');

const logsDir = process.env.JEV_QA_LOGS_DIR ?? '/tmp/jev-qa-logs';
const outDir = process.env.JEV_RESULTS_DIR ?? join(toolRoot, 'results');

function listCases() {
  return readdirSync(logsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^case-\d{3}$/.test(d.name))
    .map((d) => d.name)
    .sort();
}

function escapeCsv(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const cases = listCases();
  const rows = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const caseId of cases) {
    const caseDir = join(logsDir, caseId);
    const meta = JSON.parse(readFileSync(join(caseDir, 'meta.json'), 'utf8'));
    const rawLog = readFileSync(join(caseDir, 'log.txt'), 'utf8');
    const { masked, hadReportSection } = maskVerdictInLog(rawLog);

    let jevAnswer = '';
    let confidence = 0;
    let fallback = true;
    let match = null;
    let error = '';

    try {
      const { answer, usage } = await evaluateQaLogState({ state: masked });
      totalInputTokens += usage.input_tokens ?? 0;
      totalOutputTokens += usage.output_tokens ?? 0;
      const evaluated = evaluateJevChoice(answer);
      jevAnswer = evaluated.jevAnswer;
      confidence = evaluated.confidence;
      fallback = evaluated.fallback;
      match = computeMatch(meta.qa_verdict, jevAnswer, fallback);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      error = error.replaceAll(process.env.JEV_API_KEY ?? '', '<REDACTED>');
    }

    rows.push({
      case: caseId,
      qa_verdict: meta.qa_verdict,
      jev_answer: jevAnswer,
      confidence,
      fallback,
      match,
      had_report_section: hadReportSection,
      error,
    });
    process.stderr.write(`${caseId} done\n`);
  }

  const evaluated = rows.filter((r) => !r.error);
  const nonFallback = evaluated.filter((r) => !r.fallback);
  const qaFail = evaluated.filter((r) => r.qa_verdict === '不通過');
  const qaFailCaught = qaFail.filter(
    (r) => !r.fallback && r.jev_answer === '不通過' && r.match === true,
  );

  const labelAgreement = evaluated.filter((r) => r.jev_answer === r.qa_verdict).length;

  const summary = {
    generated_at_utc: new Date().toISOString(),
    case_count: rows.length,
    api_errors: rows.filter((r) => r.error).length,
    overall_accuracy: evaluated.length
      ? evaluated.filter((r) => r.match === true).length / evaluated.length
      : null,
    label_agreement_all_cases: evaluated.length
      ? labelAgreement / evaluated.length
      : null,
    accuracy_non_fallback: nonFallback.length
      ? nonFallback.filter((r) => r.match === true).length / nonFallback.length
      : null,
    fail_recall_non_fallback: (() => {
      const failDecided = qaFail.filter((r) => !r.fallback);
      if (failDecided.length === 0) {
        return null;
      }
      return qaFailCaught.length / failDecided.length;
    })(),
    fail_recall_overall: qaFail.length ? qaFailCaught.length / qaFail.length : null,
    fallback_rate: evaluated.length
      ? evaluated.filter((r) => r.fallback).length / evaluated.length
      : null,
    usage: {
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      estimated_cost_usd: estimateInputCostUsd(totalInputTokens),
    },
    confidence_threshold: 0.85,
    logs_dir: logsDir,
  };

  const header =
    'case,qa_verdict,jev_answer,confidence,fallback,match,error';
  const csvLines = [
    header,
    ...rows.map((r) =>
      [
        r.case,
        r.qa_verdict,
        r.jev_answer,
        r.confidence,
        r.fallback,
        r.match === null ? '' : r.match,
        r.error,
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ];

  writeFileSync(join(outDir, 'replay-results.csv'), `${csvLines.join('\n')}\n`, 'utf8');
  writeFileSync(
    join(outDir, 'replay-summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    join(outDir, 'replay-results.json'),
    `${JSON.stringify({ summary, rows }, null, 2)}\n`,
    'utf8',
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  const safe = msg.replaceAll(process.env.JEV_API_KEY ?? '', '<REDACTED>');
  console.error(safe);
  process.exit(1);
});
