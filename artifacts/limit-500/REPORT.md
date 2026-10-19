# limit-500 — 交付報告

- **PR:** （push 後由 CI 填入下方連結）
- **分支:** `cursor/limit-500-numbers-7037`
- **HEAD:** （見 `git rev-parse HEAD`）
- **資產版本:** `20261019a`
- **與 #95 關係:** 可能與 [PR #95](https://github.com/UltronService/milksha-demo/pull/95)（`cursor/controller-default-number-5dd5`）衝突同一批檔案；#95 合併後需 rebase。

## 雲端拒收代碼（open item）

| 項目 | 值 |
|------|-----|
| 常數 | `too_many_board_numbers` |
| 狀態 | **TODO-align-with-backend** — `UltronService/milksha-cloud` 無法從本環境讀取 PR；fake-cloud 與 `controller-command-errors.js` 已用此 code，待 cloud 合併後對齊 |

## 變更摘要

| 區域 | 內容 |
|------|------|
| `devCommand` | 移除 `normalizeParams` / `buildDevCommandRequest` 的 1024 位元組上限；**不**在 controller 檢查 500 筆 |
| `boxHeartbeat` | 1024 檢查保留 |
| fake-cloud | `push_numbers` 合計 >500 回 400 + `too_many_board_numbers` |
| Controller UI | 映射為紅字文案「號碼太多（上限 500 個），雲端拒收」 |
| Board | 無 50 筆隱藏上限；`applyPayload` 大列表效能微調（Set 查詢、略過多餘 slice） |
| 看板分頁 | `PAGE_SIZE=10`、`PAGE_INTERVAL_MS=6000` 未改 |

## 19 項驗收對照

| # | 項目 | 測試 |
|---|------|------|
| 1 | 18 筆不阻擋、可建請求並送出 | `tests/limit-500.test.js` item 1 + item 12（fake-cloud） |
| 2 | 30 筆不阻擋 | item 2 |
| 3 | 60 筆不阻擋 | item 3 |
| 4 | 500 筆不阻擋 | item 4 |
| 5 | 60×6 字 CJK 不阻擋 | item 5 |
| 6 | UI 不出現 1024 相關文案 | item 6 |
| 7 | 其他驗證仍阻擋 | item 7 |
| 8 | heartbeat 1024 仍有效 | item 8 |
| 9 | 第 501 筆雲端拒收 → 指定中文 | item 9 + 9b |
| 10 | 其他錯誤為中文、非 raw code | item 10 |
| 11 | 拒收後輸入框保留已打字內容 | item 11 |
| 12 | mock cloud 送 500 成功 | item 12 |
| 13 | 60 筆 → 6 頁翻頁順序 | item 13 |
| 14 | 500 筆 → 50 頁 | item 14 |
| 15 | 末頁後回到第 1 頁 | item 15 |
| 16 | 500 筆時新號仍跳第 1 頁 | item 16 |
| 17 | 500 筆 DOM 僅 10 格 | item 17 |
| 18 | 4× CPU：套用 500 <200ms、翻頁 longtask <50ms | `tests/e2e/limit-500-board-perf.spec.mjs` |
| 19 | 100 次翻頁 heap 增長 ≤10MB | 同上 e2e |

## 單元測試

| 指標 | 數值 |
|------|------|
| 全 suite | 355 tests（本機 `npm test`） |
| 本分支新增 | `tests/limit-500.test.js` **18** cases |
| 既有失敗（layout harness 等） | **10**（與 main 快照同類，非本分支新增） |

## E2E 效能（本機 Playwright Chromium，CDP CPU 4×）

| 指標 | 量測 |
|------|------|
| `applyPayload` 500 筆（暖機後） | < 200 ms（通過） |
| 翻頁 longtask 峰值（套用後重置 observer） | < 50 ms（通過） |
| 100 次翻頁 heap 增長 | ≤ 10 MB（通過） |

## CI

| 欄位 | 值 |
|------|-----|
| Run ID | push 後更新 |
| 分支獨有 E2E 失敗數 | push 後更新（目標 **0**，失敗 ⊆ main ~38） |

## 手動 UAT（非工程）

1. 開 controller，`zz-qa-store-a` + fake-cloud，累積多筆快速送號至列表，一次送出 30+ 筆 → 應成功、不出現 1024 文案。
2. 用 Tammy／模擬送 500 筆 ready → 看板應分頁，指示器 `1/50`。
3. 故意送第 501 筆（ready+preparing 合計）→ 紅字「號碼太多（上限 500 個），雲端拒收」，輸入框字保留。
