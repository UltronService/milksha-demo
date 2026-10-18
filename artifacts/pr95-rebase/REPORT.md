# PR #95 — merge `origin/main` @ `2f9b2bf`（#98 CI 分層）

- **PR:** https://github.com/UltronService/milksha-demo/pull/95
- **新 HEAD:** `c20f2e7`（`cursor/controller-default-number-5dd5`）
- **QA：** 重驗符合（2026-10-18）
- **合併方式:** `git merge origin/main`（無 force push）
- **資產版本:** `20261017f`（高於 main `20261017d`）
- **不合併**

## CI 結論

| Run | 連結 | Workflow | 結論 | 說明 |
|-----|------|----------|------|------|
| 合併後（含分支獨有失敗） | [39118851928](https://github.com/UltronService/milksha-demo/actions/runs/39118851928) | CI | **紅** | 唯一分支獨有：`controller-quick-send-resend.spec.mjs:4:1`（已修） |
| 修復後（證據 run） | [39120102083](https://github.com/UltronService/milksha-demo/actions/runs/39120102083) | CI | **紅** | 失敗 ⊆ main **38** 項基準；**分支獨有 0** |

**main 38 項基準：** `artifacts/ci-nightly/main-baseline-failures-39105020723.txt`（36 + addendum：`cloud-remote-send`、`pr23-login-count`）

### Run `39120102083` 全部失敗（逐一對照 main 38 項）

**證據 run 結論：紅燈（failure）。**  
**唯一失敗測試數：14**（含 `home-board-ten-send-clear` 三個 parameterized 標題；**分支獨有 0**）。  
來源：`gh run view 39120102083 --log-failed` 解析；baseline 檔 `artifacts/ci-nightly/main-baseline-failures-39105020723.txt`（36 + addendum 2 = **38**）。  
行號若與 baseline 不同，以**測試標題**對應同一 baseline 條目（main 上 spec 曾移位）。

| # | Shard（failed job） | 失敗測試（Playwright 完整標題） | 對應 baseline 38 項（條目） |
|---|---------------------|----------------------------------|-----------------------------|
| 1 | `e2e-pr23-login-rate` | `pr23-login-count.spec.mjs:55:3 › PR23 login rate › 5 min normal board idle` | **2 / 38**（addendum）— `pr23-login-count.spec.mjs:55:3 › … 5 min normal board idle` |
| 2 | `e2e (2)` | `board-cell-peak-simulation.spec.mjs:34:3 › board cell integrity under peak simulation › 3-min peak run: sampled cells, detached drain, no dup numbers` | **3 / 38** — 同標題 |
| 3 | `e2e (10)` | `cloud-qa-checklist.spec.mjs:40:3 › PR22 cloud QA checklist (fake-cloud routed as prod) › network cable pull and restore without duplicate ready numbers` | **10 / 38** — 同標題（baseline 記 `…:48:3`） |
| 4 | `e2e (10)` | `cloud-remote-send.spec.mjs:89:3 › cloud remote send (isolated contexts) › ten sends produce ten numbers and clear works` | **1 / 38**（addendum）— 同標題 |
| 5 | `e2e (15)` | `controller-post-send-board-read-abort.spec.mjs:160:3 › controller post-send today_board read abort (fake-cloud) › push_numbers HTTP 500 still shows error and rolls back local ready list` | **18 / 38** — 同標題（baseline 記 `…:167:3`） |
| 6 | `e2e (16)` | `controller-store-picker-evidence.spec.mjs:112:3 › controller store picker evidence (fake-cloud) › 3c two minutes: devLogin and listStores counts with store switch` | **22 / 38** — 同標題（baseline 記 `…:121:3`） |
| 7 | `e2e (16)` | `controller-store-picker.spec.mjs:71:3 › controller cloud store picker › new store appears within poll window after board heartbeat` | **23 / 38** — 同標題（baseline 記 `…:80:3`） |
| 8 | `e2e (18)` | `fresh-browser-pause-heartbeat.spec.mjs:24:3 › fresh browser 連線暫停 with existing session › boxHeartbeat 403 store_not_allowed shows pause without new devLogin` | **27 / 38** — 同標題 |
| 9 | `e2e (20)` | `home-board-cloud-recovery.spec.mjs:16:3 › home board cloud recovery › B-N07: 60s blocked routes recover within 30s without manual resync` | **31 / 38** — 同 B-N07 標題（baseline 記 `…:24:3`） |
| 10 | `e2e (22)` | `home-board-quick-send-one.spec.mjs:42:1 › ten quick sends yield ten ready numbers; clear board works` | **33 / 38** — 同標題 |
| 11 | `e2e (22)` | `home-board-stale-storage.spec.mjs:72:1 › stale cloud settings on home board migrate to bundled and connect cloud` | **34 / 38** — 同標題 |
| 12 | `e2e (23)` | `home-board-ten-send-clear.spec.mjs:106:3 › local-link fresh context: ten quick sends then 清空看板 (board tab not reloaded)` | **35 / 38** — 同標題 |
| 13 | `e2e (23)` | `home-board-ten-send-clear.spec.mjs:106:3 › local-link localStorage seeded 5ab3c35-style: ten quick sends then 清空看板 (board tab not reloaded)` | **36 / 38** — 同標題 |
| 14 | `e2e (23)` | `home-board-ten-send-clear.spec.mjs:106:3 › local-link localStorage seeded 8138a4a-style: ten quick sends then 清空看板 (board tab not reloaded)` | **37 / 38** — 同標題 |

**先前摘要表遺漏（已補上）：** 上表 **#5**（`controller-post-send-board-read-abort`）、**#8**（`fresh-browser-pause-heartbeat`）。

本 run **未**出現 `controller-quick-send-resend.spec.mjs:4:1`（`da07bd3` 起依目標狀態判斷重複號碼）。  
本 run **未**出現 baseline 其餘 24 項中的任一條（例如 `forbidden-store-then-qa-isolation`、`home-board-art-alignment` 等）— 與 main 上 flaky／shard 矩陣一致，不視為分支獨有通過或失敗。

### 本機驗證

- `npx playwright install chromium`
- `npm test`：**350/350** pass
- `board-uber-six-char-column-overflow.spec.mjs`：**5/5** pass
- `controller-quick-send-resend.spec.mjs:4`：修復後 pass

## 衝突檔案與解法

| 檔案 | 解法 | 功能影響 |
|------|------|----------|
| `config/asset-version.json` / `js/milksha-asset-version.js` | 採比 main 新之 `20261017e` → 後續 js 變更升至 `20261017f` | 快取刷新 |
| `index.html` | 合併 main 的 `board-auto-pair*`、`board-bind-api` 與 #95 的 `chip-overflow-fit.js` | 看板同時具自動配對 + overflow 縮放 |
| `controller/index.html` | main 腳本清單 + 版本；合併後還原 #95 `quick-send-rule-note` / `quick-send-number-row` | 控制端規則提示 UI 保留 |
| `receiver-demo/index.html` | main 腳本列 + 版本 bump | 展示頁與 main 一致 |
| `scripts/check-milksha-board-official-layout.mjs` | 採 main `copySiteForPlaywright`；Foodpanda 斷言改 `6405`（#95 去 `#` 規則） | 與看板顯示規則一致，非放寬 assertion |
| `tests/controller-redesign-acceptance.test.js` | `BOARD_DIFF_WHITELIST` = auto-pair ×2 + `chip-overflow-fit.js`；保留 8/8b/8c | 驗收 #8 兩 PR 白名單合併 |
| `tests/e2e/controller-source-quick-send.spec.mjs` | 無效號碼：保留 #95（disabled + `quick-send-rule-note`），有效送出仍用 harness 展開 helper | QA 已驗 UX 不還原 main 錯誤槽 |

## #95 測試與 CI manifest

- `tests/e2e/board-uber-six-char-column-overflow.spec.mjs`：PR tier（`e2eGlob` 已涵蓋，非 live-cloud）
- `tests/e2e/board-uber-six-char-column-overflow-helpers.mjs`：已加入 `tests/ci-test-tier-manifest.json` → `supportPaths`

## 合併後功能行為（相對各自 PR 意圖）

| 區域 | 行為 |
|------|------|
| **看板** | #97 自動配對／綁定提示腳本載入；#95 chip 欄寬 overflow 縮放仍於 render／翻頁後執行 |
| **控制端** | 規則旁 `rule-note`、無效號碼禁用送出；重複號碼僅在**同一準備中／可取餐狀態**阻擋（跨區不重複視為可送，符合 resend 測試） |

## 分支獨有問題與修復

1. **合併時誤刪 `controller/index.html` 腳本區** → 自 `origin/main` 還原並補回 #95 markup（`6f2a8ac`）
2. **`controller-quick-send-resend` 全欄位重複判斷** → 改為依 `readQuickSendStatus()` 分區（`da07bd3`）

## QA 是否需重驗

**建議：有限重驗（非全量）**

| 項目 | 原因 |
|------|------|
| Uber 6 字 + icon 欄寬（1080p／4K） | #95 核心；合併後腳本清單與 `milksha-board.js` 皆有變 |
| 控制端快速送出：無效號碼、跨狀態同號 | 合併曾短暫遺失 rule-note；重複邏輯已調整 |
| 看板自動配對提示（若店端已開 #97） | main 新行為首次與 overflow 同頁載入 |

**QA 重驗：符合**（總監確認）。不需重跑完整 QA 清單：CI 與本機單元已覆蓋 harness／acceptance 8；e2e 紅燈均屬 main 既有清單。

## PR 摘要（交接）

- **What:** PR #95 rebase 至 `2f9b2bf`；衝突解完；manifest／資產版本／acceptance 白名單合併；修正合併回歸與重複號碼判斷。
- **Why:** main 已合 #98 CI 分層與 #97 自動配對，#95 需可合併且 CI 不得新增失敗。
- **How to test:** 照上表有限 UAT + `npm test` + overflow e2e；對照 CI run `39120102083`。
