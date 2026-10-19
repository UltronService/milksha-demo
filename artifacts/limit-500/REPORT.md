# limit-500 — 交付報告

- **HEAD（本報告對應提交）:** `5ab4ea7bb99859886bf25e4b5b912e0c6cfac2c4`
- **PR:** https://github.com/UltronService/milksha-demo/pull/107
- **分支:** `cursor/limit-500-numbers-7037`
- **資產版本:** `20261019e`
- **Backend:** milksha-cloud PR #38（行為以 `tools/fake-cloud` mock 對齊）

---

## Item 17 / 記憶體（Owner 必讀 — 本輪**未改**看板渲染）

| 問題 | 結論 |
|------|------|
| DOM 是否建立 500 個號碼格？ | **否。** `renderZoneHtml` / `patchZonePage` 只迴圈 **`PAGE_SIZE`（10）** 次建立 `milksha-num-cell`（與 `main` 相同）。500 筆只存在於 **JS 狀態** `readyItems` / `prepItems`（供分頁），不會變成 500 個 chip DOM。 |
| 全板 DOM 節點數 | 準備中 + 請取餐兩區各 10 格 → 實測 **20** 個 `.milksha-num-cell`（其中一區可為空槽）。Item 17 單元測只數 **ready 區 10 格**。 |
| 是否保留舊 payload？ | **否。** `applyPayload` 每次以 `metaById = nextMeta` 覆寫；不保留歷史 `numberContent` 陣列。 |
| Item 19 heap（本機 Chromium） | 套用 500 筆後 **100 次翻頁**：`usedJSHeapSize` **9.54 MB → 9.54 MB**，**增長 0 MB**（≤10 MB 門檻）。 |

**結論：** 不需為 item 17 改渲染；若未來要「虛擬化」500 筆 **in-memory 模型**，才需 owner 另案核准。

---

## 雲端行為（fake-cloud）

| 規則 | 實作 |
|------|------|
| >500 號 | 不拒收；保留送出順序**最後 500**（`trimTicketsToBoardCap`） |
| `push_numbers` params >256 KB | `400` + `push_numbers_params_too_large` |
| 其他 devCommand body >1024 B | `400` + `invalid_command_params`（雲端 only） |
| Controller | 不做 500 筆／devCommand size 本機檢查 |

## Controller UI

| 情境 | 文案 |
|------|------|
| `push_numbers_params_too_large` | **「送出失敗：號碼太多或太長。請刪掉部分號碼，或縮短號碼後再送。」**（`#quick-send-error`，輸入保留 — item 11b） |
| 非 push 的 oversized `invalid_command_params` | **「指令內容不符合規定，雲端拒收。」** |
| 其他 `invalid_command_params` | 沿用 `USER_MSG_400_INVALID` |

---

## 測試項目對照表（1–19）

| # | 驗收重點 | 自動化 | 結果 |
|---|----------|--------|------|
| 1 | 18 筆 `push_numbers` 不被 controller 驗證擋下 | `tests/limit-500.test.js` item 1 | pass |
| 2 | 30 筆同上 | item 2 | pass |
| 3 | 60 筆同上 | item 3 | pass |
| 4 | 500 筆同上 | item 4 | pass |
| 5 | 60 筆 × 6 字 CJK 號碼同上 | item 5 | pass |
| 6 | devCommand **不再**有本機 1024 UI／文案；雲端 1024 訊息不直接露出 | item 6 | pass |
| 7 | 未知指令、多餘欄位、非法 deviceId 仍被擋 | item 7 | pass |
| 8 | `boxHeartbeat` 仍受 1024 B 限制 | item 8 | pass |
| 9 | **第 501 筆仍成功（HTTP 200）**；雲端**丟最舊**、保留最後 500；看板狀態含新號、不含被丟的最舊號（**非拒收**） | item 9 + item 9b（跨 ready/preparing 順序） | pass |
| 10 | 其他雲端錯誤為中文、不露出 raw code | item 10 | pass |
| 11 | 其他雲端拒收後快速送號欄位保留 | item 11 | pass |
| 12 | fake-cloud 接受 500 筆 `push_numbers`；256KB／非 push 1024 由 PR38 雲端測（同檔 `cloud PR38`） | item 12 + PR38 cases | pass |
| 13 | 60 筆 ready 分 6 頁、每頁 10、順序正確 | item 13 | pass |
| 14 | 500 筆 ready 分 50 頁 | item 14 | pass |
| 15 | 最後一頁後回到第 1 頁 | item 15 | pass |
| 16 | 500 筆時新 ready 跳至第 1 頁 | item 16 | pass |
| 17 | DOM 僅 10 個 ready cell（非 500） | item 17 | pass |
| 18 | **4× CPU**：套用 500 筆後 `applyPayload` 耗時；翻頁期間 longtask 峰值（見下表） | `tests/e2e/limit-500-board-perf.spec.mjs` | pass（本機 + CI shard） |
| 19 | 500 筆 + 100 次翻頁 heap 增長 ≤10 MB | 同上 E2E | pass |

### Item 18 量測（Chromium CDP `Emulation.setCPUThrottlingRate: 4`）

| 指標 | 門檻 | 本機量測（`artifacts/limit-500/measure-item18.mjs` @ HEAD） |
|------|------|--------------------------------------------------------------|
| 套用 500 筆後 `applyPayload` 時間 | <200 ms | **≈7.3 ms** |
| 單次翻頁週期內 longtask 最大值（3 次 `advanceZonePageForTest`） | <50 ms | **0 ms**（無 longtask 事件） |

---

## 單元／E2E 摘要

| 指標 | 數值 |
|------|------|
| `npm test` | **358** pass |
| `limit-500.test.js` | 21 cases（含 item 9b、PR38 雲端 size） |
| E2E item 18–19 | `tests/e2e/limit-500-board-perf.spec.mjs`（2 cases） |

---

## CI：run 39261339311（head `5ab4ea7`）

- **URL:** https://github.com/UltronService/milksha-demo/actions/runs/39261339311
- **狀態:** `completed` / `failure`（與 `main` 相同之 PR-tier E2E 不穩定集合）
- **本 run 唯一 E2E 失敗數:** **18**（含 isolated `pr23-login-count` 1 筆）
- **對照 baseline:** `artifacts/ci-nightly/main-baseline-failures-39105020723.txt`（**38** 筆唯一失敗，run 39105020723 + addendum）
- **僅本分支新增、不在 baseline 的失敗:** **0**（`limit-500-board-perf.spec.mjs` 未出現在失敗清單）
- **說明:** 本 run 失敗清單為 baseline 之子集（18 ⊆ 38）；無需為 limit-500 放寬測試。

---

## 舊測試改寫清單（對新 spec）

`main` 上**沒有**獨立的「devCommand 1024 本機上限」舊測試被改寫刪除；行為改由**新增**檔案覆蓋。

| 類型 | 檔案 | 說明 |
|------|------|------|
| **新增** | `tests/limit-500.test.js` | items 1–17、9b、PR38 雲端 trim／size |
| **新增** | `tests/e2e/limit-500-board-perf.spec.mjs` | items 18–19 |
| **擴充（非改寫舊 case）** | `tests/controller-command-errors.test.js` | 新增 2 則：`push_numbers_params_too_large` → 新 UX 文案；oversized 非 push `invalid_command_params` →「指令內容不符合規定，雲端拒收。」 |

---

## 手動 UAT（精簡）

1. 一次送 501 筆 → 成功；看板／雲端僅 500 筆，最舊被丟。  
2. 超大 `push_numbers` → 紅字「送出失敗：號碼太多或太長…」，欄位保留。  
3. Elements：ready 區僅 10 個 `.milksha-num-cell`。
