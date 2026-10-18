# PR #95 — merge `origin/main` @ `2f9b2bf`（#98 CI 分層）

- **PR:** https://github.com/UltronService/milksha-demo/pull/95
- **新 HEAD:** `da07bd3`（`cursor/controller-default-number-5dd5`）
- **合併方式:** `git merge origin/main`（無 force push）
- **資產版本:** `20261017f`（高於 main `20261017d`）
- **不合併**

## CI 結論

| Run | 連結 | Workflow | 結論 | 說明 |
|-----|------|----------|------|------|
| 合併後（含分支獨有失敗） | [39118851928](https://github.com/UltronService/milksha-demo/actions/runs/39118851928) | CI | **紅** | 唯一分支獨有：`controller-quick-send-resend.spec.mjs:4:1`（已修） |
| 修復後（證據 run） | [39120102083](https://github.com/UltronService/milksha-demo/actions/runs/39120102083) | CI | **紅** | 失敗 ⊆ main **38** 項基準；**分支獨有 0** |

**main 38 項基準：** `artifacts/ci-nightly/main-baseline-failures-39105020723.txt`（36 + addendum：`cloud-remote-send`、`pr23-login-count`）

### Run `39120102083` 唯一 e2e 失敗（對照 baseline）

| 失敗 spec（摘要） | 在 38 項 baseline |
|------------------|-------------------|
| `board-cell-peak-simulation` — 3-min peak | 是 |
| `cloud-qa-checklist` — network cable pull | 是 |
| `cloud-remote-send` — ten sends | 是（addendum） |
| `controller-store-picker` / `controller-store-picker-evidence` | 是 |
| `home-board-cloud-recovery` — B-N07 | 是 |
| `home-board-quick-send-one` — ten quick sends | 是 |
| `home-board-stale-storage` | 是 |
| `home-board-ten-send-clear` ×3 variants | 是 |
| `pr23-login-count` — 5 min idle | 是（addendum） |

本 run 未再出現 `controller-quick-send-resend.spec.mjs:4:1`（`da07bd3` 依「目標狀態」判斷重複號碼）。

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

不需重跑完整 QA 清單：CI 與本機單元已覆蓋 harness／acceptance 8；e2e 紅燈均屬 main 既有清單。

## PR 摘要（交接）

- **What:** PR #95 rebase 至 `2f9b2bf`；衝突解完；manifest／資產版本／acceptance 白名單合併；修正合併回歸與重複號碼判斷。
- **Why:** main 已合 #98 CI 分層與 #97 自動配對，#95 需可合併且 CI 不得新增失敗。
- **How to test:** 照上表有限 UAT + `npm test` + overflow e2e；對照 CI run `39120102083`。
