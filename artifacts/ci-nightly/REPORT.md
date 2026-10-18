# CI nightly split — implementation report

- **PR:** https://github.com/UltronService/milksha-demo/pull/98
- **Head commit:** `61e9305` → 下一輪 push 含 zone 點擊修正與 12 shard
- **整體 CI 結論：** run `39100018110` **不通過**（unit 綠；e2e 多 shard 失敗／逾時取消）
- **上一輪失敗 run（分類基準）：** https://github.com/UltronService/milksha-demo/actions/runs/39095700095
- **報告更新（台北）：** 2026-10-18

## Run `39095700095` 失敗分類

| 類別 | Jobs | 說明 |
|------|------|------|
| **(a) 15m 逾時取消** | e2e (4)(5)(7)(8) | job `timeout-minutes: 15` 內未跑完；`fail-fast: false` 仍會因逾時結束 |
| **(b) 測試 assertion／互動失敗** | e2e (1)(2)(3)(6) | 見下表 |

### (b) 主要失敗 spec（摘要）

| Shard | 代表失敗 | 根因（本輪修復方向） |
|-------|----------|----------------------|
| 1 | `board-animation-*` 等 | 連線／互動逾時連鎖 |
| 2 | `board-empty-hint-states` | 測試工具區未展開即點 `#btn-connect`／POS 按鈕 |
| 3 | `cloud-qa-checklist` | 同上 + 清空看板需確認 modal |
| 6 | `controller-source-quick-send` | Uber 範例用 4 碼 `1234`（規則要 5 hex） |
| 6 | `home-board-art-alignment` | 待 CI 重跑驗證（字型 job 已裝 Roboto） |

## 假設（3–5）

1. **分片不均**：`home-board-background-6min`、`forbidden-store-then-qa-isolation` 等單檔 >3m，8 shard 仍讓部分 job 貼 15m → **增至 12 shard**。
2. **Controller  redesign 收合區**：`sec-test-tools` 預設收合，Playwright 直接 `page.click` 會等到逾時 → **改點 zone-toggle 展開**，`toBeVisible` 後再點（禁止 DOM/evaluate 強開）。
3. **quick-send 測試資料**：Uber `1234` 不符合 5 hex → 本機與 CI 皆只出現 1 格 → **改 `AB12C`**（非放寬門檻）。
4. **PR tier 守門**：`installPrTierNetworkGuard` 與 fake-cloud proxy 順序曾疑慮；proxy 路徑下本機假雲端應可通 → shim **僅保留 proxy**（守門仍可在 page 層單獨安裝）。
5. **main 既有**：`board-empty-hint` 在 `origin/main` 亦因收合區無法點連線而失敗 → **屬 harness／互動問題，非 copy-site／shard 回歸**。

## 本輪變更（總監必做）

- `expandControllerZone`／`clickControllerDevButton` 等：**只點** `data-testid="zone-toggle-*"`，展開後 `expect` 目標 `toBeVisible` 再操作。
- 回歸：`tests/controller-zone-expand-harness.test.js`（靜態禁止 `body.hidden`／`aria-expanded` 強改）、`tests/e2e/controller-zone-expand-guard.spec.mjs`（未展開點擊必失敗）。
- **12 shard**（`ci-test-tier-manifest.json` + `ci.yml`）。
- E2E 修正：`controller-source-quick-send`、`board-empty-hint-states`、`cloud-qa-checklist`（不含產品碼）。

## PR CI 耗時目標

- Workflow 牆鐘 ≤ **15m**；各 e2e job `timeout-minutes: 15`；目標最慢 shard **~10m**（12 分片）。

## 本機驗證（本輪）

- `npm test`：**338 passed**
- Playwright 抽樣：`board-empty-hint-states`、`cloud-qa-checklist`、`controller-source-quick-send`、`controller-zone-expand-guard`、connect-errors → **通過**

## 最新 CI run

| 項目 | 值 |
|------|-----|
| Head SHA | _(CI 跑完後填)_ |
| Run URL | _(CI 跑完後填)_ |
| 結論 | _(pass/fail)_ |
| unit 耗時 | |
| e2e shard 1–12 耗時 | |

## Nightly

- `.github/workflows/ci-nightly.yml`（04:00 台北；`zz-qa-ci-store`）；PR 不跑 live-cloud spec。
