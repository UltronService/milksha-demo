# PR #53 上線 retest 診斷（僅分析、未改產品碼）

## WORSE — 本地 fake-cloud 對照（4146812 → 0ed3056）

| 指標 | 4146812（#53 前） | 0ed3056（main） | 判定 |
|------|-------------------|-----------------|------|
| 主流程 latency >3s（4 條 flow 合計） | 0 | 0 | 未修復（與 QA 公網 4×~15.2s 不同環境） |
| 主流程 latency 最大值 (ms) | 1044 | 1016 | better |
| 翻頁 settled **QA 集合比對** mismatch 事件數 1080p | 2 | **0** | **better** |
| 翻頁 settled QA 集合比對 mismatch 事件數 4K | 0 | 0 | 未修復 |
| 翻頁中送 prep 號碼 **3s 內未出現** 1080p（/10 輪） | 3 | **4** | **WORSE** |
| 翻頁中送 prep 號碼 3s 內未出現 4K（/10 輪） | 2 | **4** | **WORSE** |
| 翻頁 **槽位+snapshot 修正評分** mismatch 1080p | 77 | 70 | better |
| 翻頁修正評分 mismatch 4K | 75 | 70 | better |
| mid-frame NEW（midframe 掃描） | 0 | 0 | 未修復 |

**公網 QA（僅 0ed3056 / `20261011c`，`uploads/results.json`）對照：** 1080 mismatch **7**、4K **12**、missing>3s **5/3**、主流程 **1×~15.2s** — 明顯差於本地 fake-cloud，表示 **環境路徑**（真雲端 store + Pages）與離線/fake-cloud 行為不一致。

---

## 1) 重跑方式與產物

- 腳本：`artifacts/pr53-live/run-local-compare.mjs`（git archive 各 commit → `MILKSHA_SITE_ROOT` + `tests/e2e/harness.mjs` fake-cloud + Playwright，流程對齊 `run-public-pr53live.mjs`）。
- 單 commit RED：`node artifacts/pr53-live/run-red-repro.mjs`（1080p、10 輪、5200ms 等待、翻頁中送 prep）。
- 原始 QA 公網腳本副本：`artifacts/pr53-live/run-public-pr53live.mjs`（來自 uploads；依賴 repo 未收錄的 `midframe/run-midframe-scan.mjs`，本地以 `midframe-stub.mjs` 代替 — 公網 retest 時 midNew 亦為 0）。
- 結果 JSON：`results-4146812.json`、`results-0ed3056.json`、`compare-table.json`。
- **未使用** `zz-qa-store-a` / `zz-qa-backend`；可選 CI store `zz-qa-ci-store` 需 `MILKSHA_FIREBASE_API_KEY`（本次未跑）。

---

## 2) QA「預期頁面」計算是否正確

### QA 現行算法（與公網腳本一致）

- `PAGE_SIZE = 10`；`sentAsc` 為該 zone 累積送出序（ready 僅 8100–8111，prep 含 7100–7111 + 每輪 7200+c）。
- `expectedPageSet(sentAsc, pageIndex)`：`newestFirst = sentAsc.reverse()`，取 `[pageIndex*10, pageIndex*10+10)` 的 **Set**。
- 比對：indicator 解析出 `pageIndex`（`2/2` → index 1），zone **opacity≥0.99** 時，`.milksha-zone.{z} .milksha-num` 文字集合須等於 expected Set。
- 6s 換頁：`js/milksha-board.js` 的 `PAGE_INTERVAL_MS = 6000`；QA 每輪先 `wait 5200ms` 再在翻頁動畫中送號， settled 掃描 13×500ms。

### 結論（針對 QA 報告中的 **8112/8101 + prep 7112**）

- Ready 第 2 頁（12 筆 ready 時）expected **`{8101,8100}`** 正確（newest-first 第 11–12 筆）。
- 若 settled 時 indicator 為 **`2/2`** 且 DOM 出現 **prep 的 `7112`**，這 **不是** 預期公式算錯，而是 **ready 區 DOM 混入 prep 號碼**（公網症狀）。
- **集合比對的盲點**：末頁僅 2 格有字時，Set 大小為 2，無法發現「其實還卡在第 1 頁 10 格」— 4146812 本地曾出現 indicator `2/2` 但 visible 為 8111–8102 **十筆**（整頁錯位），集合大小 10≠2 仍會抓到了。

### 修正評分（建議作為輔助，不作為 QA 唯一 Pass 條件）

- 與 e2e `board-page-turn-desync.spec.mjs` 一致：**10 個 slot**（`.milksha-num-cell .milksha-num`）對 `runtime.getSnapshot()` 同 pageIndex 的 10 個 number；空 slot 對空字串。
- 指標 **落後 DOM**（#53 刻意延後 indicator 更新）時，修正評分會在 **indicator 尚未跟上** 的幀大量報 mismatch（本地 70+ 事件/輪），**不應**直接當成與 QA 同級 regression。
- 以 **indicator 已 stable 且 numbers layer opacity≥0.99** 再跑修正評分，才與「guest 看到的頁碼」對齊。

---

## 3) 離線 / fake-cloud 綠燈 vs 公網 FAIL

| 因素 | 離線 replay / 單元 / 多數 e2e | 公網 + zz-qa-store-a |
|------|------------------------------|----------------------|
| 資料進板 | 單次 `applyPayload` 或 fake-cloud 單路徑 devCommand | Firestore realtime + `push_numbers` 後 **多次** `applyNumberContent` / poll / refresh 交疊 |
| 翻頁競態 | `advanceZonePageForTest` + 可控 offset | 6s ring + 5200ms 人工窗口 + **連續雲端列表版本** |
| 快取 | N/A | `deploy.json` / `stale-cache.json`：**僅 `20261011c`**，可排除舊 JS |
| 延遲 spike ~15.2s | 本地 ~1s/ticket | 模擬 store / 雲端指令佇列或單次 refresh 卡住（與 #53 DOM 修復無直接對應） |
| #53 修復 | 本地 fake-cloud：**QA 集合 mismatch 1080 2→0** | 公網仍 **7/12** 且 **7112 混入 ready** → 修復 **未覆蓋真雲端路徑** 或 **被額外 payload 打穿** |

---

## 4) 假設（依可能性排序）

1. **真雲端在翻頁中短時間內連續 apply，cancelAll 與 hard-rebuild 仍留 cross-zone 節點（如 prep 7112 掛在 ready layer）**  
   - **驗證**：在 board 上 hook `applyPayload` 計數 + 記錄每次 ready/prep snapshot；公網或 zz-qa-ci-store 重跑一輪翻頁。  
   - **預測**：mismatch 幀上 apply 次數 ≥3，且 mismatch 集合含他區 newest 號碼。

2. **#53 延後 page indicator 更新，QA 在 settled 用 indicator 算 pageIndex 時，偶發指標與 DOM 已一致但 prep 側 mid-send 被動畫佇列拖到 >3s**  
   - **驗證**：比對 `data-page-turn-anim` 與 prep 新號出現時間差；對照 4146812 vs 0ed3056（本地已見 missing>3s 3→4）。  
   - **預測**：missing>3s 的 cycle 與 `animatingAtSend` 高度相關，且 post-#53 略增。

3. **QA 使用 `.milksha-num` 含翻頁 float/transition 節點，公網 4K 時較易把 **prep 殘影** 算進 ready zone**  
   - **驗證**：mismatch 當下改查 `.milksha-num-cell` 父層 zone class + `opacity`；與 midframe 掃描對照。  
   - **預測**：部分 mismatch 在 slot 級評分為 pass，但集合評分 fail。

4. **~15.2s 主流程延遲來自雲端/模擬器而非看板 JS**  
   - **驗證**：controller `pushLog` 時間戳 vs board `receiveBoard`；fake-cloud 重跑主流程 22 票。  
   - **預測**：本地 latMax ~1s，公網單點 ~15s 且 board 只收到一次最終列表。

5. **4K 翻頁動畫更長，5200ms 窗口與 1080 不同步，公網 4K mismatch 12 > 1080 的 7**  
   - **驗證**：記錄 `milksha-board-anim` 實際 WAAPI duration vs viewport。  
   - **預測**：4K 在 mid-scan 800ms 內 settled 帧更少，集合 mismatch 重複計次更高。

---

## 5) RED 重現（本地）

```bash
node artifacts/pr53-live/run-red-repro.mjs
# exit 1 — post-#53  workspace / fake-cloud
# missingOver3sCount: 3~4（對齊 QA「翻頁中 prep 3s 未上板」類型）
# pageMismatchEvents: 0（未在本地假雲重現 QA 的 7112 ready 混入）
```

若要對齊公網 **7112/ready** 需真雲 store（`zz-qa-ci-store` + API key）或錄製 p2 multi-apply 序列餵給 `scripts/offline/p2-snaps-replay.mjs`。

---

## PR 摘要（給開發）

- **改了什麼**：僅 `artifacts/pr53-live/*` 診斷腳本與報告；無產品碼變更。
- **為何**：#53 merge 後公網 QA FAIL，需 before/after 與評分是否正確之證據。
- **怎麼測**：`node artifacts/pr53-live/run-local-compare.mjs`（約 25–30 分鐘）；快速 RED：`node artifacts/pr53-live/run-red-repro.mjs`。
