#!/usr/bin/env node
/**
 * PR #53 before/after compare on zz-qa-ci-store (fixed explicit-push harness).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  runRealCloudPageTurn,
  summarizeRealCloudResult,
  buildCompareTable,
  extractCommitSiteRoot,
} from '../pr53-live/real-cloud-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ART = join(dirname(fileURLToPath(import.meta.url)));
const BEFORE = process.env.PR53_BEFORE_SHA || '4146812';
const AFTER = process.env.PR53_AFTER_SHA || '38cf72d';
const CYCLES = Number(process.env.PR53_LIVE_CYCLES || 30);

const VPS = [
  { w: 1920, h: 1080, tag: '1080' },
  { w: 3840, h: 2160, tag: '4k' },
];

async function runOne(commit, vp) {
  const { dir, cleanup } = await extractCommitSiteRoot(commit, ROOT);
  const pushLog = [];
  try {
    process.env.PR53_LIVE_CYCLES = String(CYCLES);
    const body = await runRealCloudPageTurn(dir, vp, commit, { pushLog });
    const summary = summarizeRealCloudResult(body);
    return { commit, vp: vp.tag, summary, pushLog, raw: body };
  } finally {
    cleanup();
  }
}

async function main() {
  mkdirSync(ART, { recursive: true });
  const results = {};
  for (const commit of [BEFORE, AFTER]) {
    for (const vp of VPS) {
      const key = `${commit.slice(0, 7)}-${vp.tag}`;
      console.log(`[run] ${key}…`);
      results[key] = await runOne(commit, vp);
      writeFileSync(join(ART, `pr53-rerun-${key}.json`), JSON.stringify(results[key].summary, null, 2));
      writeFileSync(join(ART, `pr53-rerun-push-${key}.json`), JSON.stringify(results[key].pushLog, null, 2));
    }
  }
  const b108 = results[`${BEFORE.slice(0, 7)}-1080`].summary;
  const a108 = results[`${AFTER.slice(0, 7)}-1080`].summary;
  const b4k = results[`${BEFORE.slice(0, 7)}-4k`].summary;
  const a4k = results[`${AFTER.slice(0, 7)}-4k`].summary;
  const compare = buildCompareTable(b108, a108, b4k, a4k);
  writeFileSync(join(ART, 'pr53-rerun-compare-table.json'), JSON.stringify(compare, null, 2));
  const md = renderMd(BEFORE, AFTER, compare, results);
  writeFileSync(join(ART, 'RERUN-53-COMPARE.md'), md);
  console.log(md);
}

function renderMd(before, after, compare, results) {
  const lines = [
    '# PR #53 真雲重跑（fixed harness）',
    '',
    `Store: \`zz-qa-ci-store\` · 各 **${CYCLES}** 輪 · before \`${before.slice(0, 7)}\` / after \`${after.slice(0, 7)}\``,
    '',
    '## 稽核（舊資料）',
    '',
    '| 問題 | 答案 | 依據 |',
    '| --- | --- | --- |',
    '| (a) 03:36 30 輪 cross-zone 是否同一 harness / allocateOrderNumber 路徑？ | **是** | 舊 `artifacts/pr53-live/real-cloud-harness.mjs` `fireTicket`：`fill(fld-no)` + `click(btn-add-ticket)`（`cursor/pr53-live-diagnose-ed3b` 該檔 L79–82）→ `controller/controller-app.js` `btn-add-ticket` handler L1868–1871 呼叫 `allocateOrderNumber()` L662–684 |',
    '| (b) 4K「>3s 5→16 輪」是否受 +1 欄位影響？ | **是（page-turn 指標）／否（fresh-latency 腳本）** | `missingOver3sCount`：`midNo=7200+c` 後 3s 內等 prep DOM（`real-cloud-harness.mjs` L147–159、L212–213）；ready seed 若誤送 7112 等 prep 號會 inflate。`scripts/fresh-latency-pause-live-qa.mjs` L140–147 僅 `btn-send-numbers`，**非** fld-no race。 |',
    '',
    '## 重跑結果（explicit push + push assert）',
    '',
    '| 指標 | 1080 before | 1080 after | 4K before | 4K after |',
    '| --- | --- | --- | --- | --- |',
  ];
  const keys = [
    ['crossZoneRoundCount', 'cross-zone 輪數'],
    ['missingOver3sCount', '>3s 輪數'],
    ['qaSetMismatchEvents', 'QA set 不合'],
    ['slotMismatchEvents', 'slot 不合'],
  ];
  for (const [k, label] of keys) {
    lines.push(
      `| ${label} | ${b108Val(results, before, '1080', k)} | ${b108Val(results, after, '1080', k)} | ${b108Val(results, before, '4k', k)} | ${b108Val(results, after, '4k', k)} |`,
    );
  }
  lines.push('', `anyWorse（舊表邏輯）: **${compare.anyWorse}**`, '');
  return lines.join('\n');
}

function b108Val(results, commit, tag, key) {
  const r = results[`${commit.slice(0, 7)}-${tag}`];
  return r?.summary?.[key] ?? '—';
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
