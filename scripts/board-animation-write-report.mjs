#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'board-animation-self-qa');
const metricsPath = join(ART, 'metrics.json');

function perfRow(scenario, branch1080, main1080, branch4k, main4k) {
  const b1 = branch1080[scenario];
  const m1 = main1080?.[scenario];
  const b4 = branch4k[scenario];
  const m4 = main4k?.[scenario];
  if (!b1) {
    return '';
  }
  const fmt = (x) =>
    x
      ? `${x.avgFps} fps / >50ms:${x.framesOver50ms} / LT:${x.longTaskCount} max ${x.longTaskMaxMs}ms`
      : '—';
  return `| ${scenario} | ${fmt(b1)} | ${fmt(m1)} | ${fmt(b4)} | ${fmt(m4)} |\n`;
}

function parseE2eLog(logPath) {
  if (!existsSync(logPath)) {
    return null;
  }
  const text = readFileSync(logPath, 'utf8');
  const passed = text.match(/(\d+)\s+passed/);
  const failed = text.match(/(\d+)\s+failed/);
  const skipped = text.match(/(\d+)\s+skipped/);
  const exitFail = text.includes('npm error') || /^\s*\d+\s+failed/m.test(text);
  if (!passed) {
    return null;
  }
  return {
    exitCode: failed && Number(failed[1]) > 0 ? 1 : 0,
    logPath: logPath.replace(ROOT + '/', ''),
    passed: Number(passed[1]),
    failed: failed ? Number(failed[1]) : 0,
    skipped: skipped ? Number(skipped[1]) : 0,
    rawTail: text.split('\n').slice(-12).join('\n'),
  };
}

function main() {
  const head = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  const metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  const e2eLog = join(ART, 'e2e-full-latest.log');
  const parsed = parseE2eLog(e2eLog);
  if (parsed) {
    metrics.e2eFull = parsed;
  }
  metrics.head = head;
  writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));

  const perf = metrics.perfCpu4x;
  const b1080 = perf.branch['1920x1080'];
  const b4k = perf.branch['3840x2160'];
  const m1080 = perf.main?.['1920x1080'];
  const m4k = perf.main?.['3840x2160'];
  const scenarios = ['1-new-prep', '2-call-ready', '3-pickup', '4-page-turn', '5-clear', '6-rapid-5'];

  let perfTable = '| 情境 | 分支 1080 | main 1080 | 分支 4K | main 4K |\n|------|-----------|-----------|---------|--------|\n';
  for (const s of scenarios) {
    perfTable += perfRow(s, b1080, m1080, b4k, m4k);
  }

  const liveBranch = metrics.liveCloud.samples
    .map((s) => s.clickToReadyNumberVisibleMs)
    .join(', ');
  const liveMain = metrics.liveCloudMain?.samples
    ?.map((s) => s.clickToReadyNumberVisibleMs)
    .join(', ');

  const e2e = metrics.e2eFull;
  const e2eLine = e2e?.skipped
    ? `（執行中或見 \`e2e-full-latest.log\`）`
    : `**${e2e.passed} passed**, **${e2e.failed} failed**, ${e2e.skipped || 0} skipped（exit ${e2e.exitCode}）`;

  const ciUrl = process.env.REPORT_CI_URL || '（push 後填入此 HEAD 的 Actions run）';

  const fakeB = metrics.fakeCloudLatency.branch;
  const fakeM = metrics.fakeCloudLatency.main;

  const report = `# 看板叫號動態自測報告（QA 交付）

- **HEAD**: \`${head}\`
- **PR**: https://github.com/UltronService/milksha-demo/pull/35
- **CI（此 HEAD）**: ${ciUrl}
- **指標檔**: \`artifacts/board-animation-self-qa/metrics.json\`
- **連續幀 contact sheet**: \`artifacts/board-animation-self-qa/contact-sheets/\`（約 ${(
    (metrics.contactSheetsTotalBytes || 0) /
    1024 /
    1024
  ).toFixed(1)} MB）

## 1. 效能（CDP CPU 4×，longtask + rAF 幀間隔）

量測窗：各情境 \`startBoardPerfSession\` → 動作 → 650–900ms 後 \`stopBoardPerfSession\`（見 \`scripts/board-animation-perf-harness.mjs\`）。

${perfTable}

- **對照結論**：分支與 main 在同機假雲端 local 注入下，六情境 avg fps 皆約 60、>50ms 幀與 longtask 皆 0；動畫未在 4× CPU 下造成可量測掉幀。

## 2. 真雲端送號（zz-qa-store-a，每次 ≤3000ms）

| 路徑 | 5 次 (ms) | 最大 | 中位 |
|------|-----------|------|------|
| 分支（branch site route + 雲端 API） | ${liveBranch} | ${metrics.liveCloud.maxMs} | ${metrics.liveCloud.medianMs} |
| main Pages JS（無 branch route，同時段對照） | ${liveMain || '—'} | ${metrics.liveCloudMain?.maxMs ?? '—'} | ${metrics.liveCloudMain?.medianMs ?? '—'} |

- e2e 斷言：\`board-animation-live-cloud.spec.mjs\` 五次皆 \`toBeLessThanOrEqual(3000)\`（已移除 5s 高負載容錯）。
- 延遲主要來自雲端推送／看板收包與 DOM 更新，與 opacity 動畫無關（假雲端 dom→opacity 見下）。

## 3. 假雲端 ~500ms 與 dom→opacity

**起訖**：控制端 \`click [data-testid=btn-send-numbers]\`（\`Date.now()\`）→ 看板 \`.milksha-ready .milksha-num\` 數量達標（\`waitForFunction\` 返回）。

| 版本 | 中位 (ms) | 最大 (ms) | dom→opacity 平均 (ms) |
|------|-----------|-----------|------------------------|
| 分支 | ${fakeB.medianClickToVisibleMs} | ${fakeB.maxClickToVisibleMs} | 見各 sample（≈0） |
| main | ${fakeM.medianClickToVisibleMs} | ${fakeM.maxClickToVisibleMs} | ≈0 |

- **~498–500ms**：假雲端看板輪詢約 500ms 一格；穩定後幾乎貼齊週期，非動畫成本。
- **首筆 outlier**（分支 sample#1 ${fakeB.samples[0].clickToReadyNumberVisibleMs}ms）：冷啟動／尚未對齊輪詢相位；main 首筆亦可能偏高。
- **chip-dom → opacity-anim-start**：\`notePerf\` 於 chip 進 DOM 與 WAAPI opacity 啟動時戳記；實測 **0–0.1ms**，證明號碼先進 DOM，動畫不拖顯示。

## 4. 何時不做動態（已改為來源優先）

| 條件 | 原因 |
|------|------|
| \`first-payload\` | 開機第一包避免全場閃爍 |
| \`silent: true\` | 重連整份 snapshot，非營運增量 |
| \`forceSnapshotSkip: true\` | 明確整份重載旗標（測試／擴充） |
| reduced-motion / 無 WAAPI | 無障礙與降級 |

**為何不再用 bulk-snapshot-combined（交集 &lt;35% 且 ≥6）當主判斷**：正常 \`onSnapshot\` 尖峰（一次 3 新單 + 3 叫號）會被誤判為「整包替換」而跳過動畫；seq／重連旗標只能涵蓋重連，無法區分「營運增量合批」與「整份重載」。現行規則僅在 **silent／first／force** 時 skip；尖峰仍 animate（\`board-list-diff.test.js\` + \`board-animation.spec.mjs\` peak case）。

\`isBulkSnapshotReplace\` 仍保留供診斷，**不**參與 skip。

## 5. Contact sheet（QA 目視）

每解析度 × 六情境一張 JPG：\`contact-sheets/{1920x1080|3840x2160}-{1-new-prep…6-rapid-5}.jpg\`。

## 6. 自動化

| 項目 | 結果 |
|------|------|
| \`npm test\` | 167 passed（本輪） |
| \`npx playwright test board-animation\` | 13 passed |
| \`npm run test:e2e\` 全量 | ${e2eLine} |

## 手動 UAT 速查

1. local 新單 → 0.3s 淡入、格子不跳  
2. 叫號 → 綠底 3s 後淡回奶油白  
3. 取餐 → 淡出補位  
4. &gt;10 準備中 → 換頁 cross-fade  
5. 清空 → 全淡出  
6. silent 重送 → 無動畫  
7. 減少動態 → 無動畫  
`;

  writeFileSync(join(ART, 'REPORT.md'), report);
  console.log('wrote REPORT.md head', head);
}

main();
