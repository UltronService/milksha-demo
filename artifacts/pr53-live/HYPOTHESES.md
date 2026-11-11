# PR #53 上線 retest 診斷（僅分析、未改產品碼）

## WORSE — 真雲端 `zz-qa-ci-store`（30 輪 × 1080p/4K，4146812 → 0ed3056）

CI run：`38164867902`（workflow `pr53-live-cloud-diagnose.yml`）。每 commit 以 git archive 餵 GitHub Pages route，後端為真實 Firestore／devCommand。

| 指標 | #53 前 4146812 | main 0ed3056 | 判定 |
|------|----------------|--------------|------|
| QA 集合 mismatch 事件（1080p，stable+opacity≥0.99） | 70 | **192** | **WORSE** |
| QA 集合 mismatch 事件（4K） | 62 | **94** | **WORSE** |
| **槽位 10 格 + snapshot** mismatch（1080p） | 0 | 0 | 未修復 |
| 槽位 mismatch（4K） | 0 | 0 | 未修復 |
| 末頁仍顯示 10 個舊號（lastPageTenOld）1080/4K | 0 / 0 | 0 / 0 | 未修復 |
| 翻頁中 prep **3s 未上板**（/30 輪）1080p | 17 | 16 | better |
| 翻頁中 prep 3s 未上板 4K | 5 | **16** | **WORSE** |
| **cross-zone 輪數**（ready 穩定幀可見 prep `7xxx`，含 **7112**）1080p | **8** | **12** | **WORSE** |
| cross-zone 輪數 4K | **4** | **14** | **WORSE** |
| 每輪 `applyPayload` 平均次數 1080p | 1.83 | 1.87 | WORSE（略） |
| 每輪 `applyPayload` 平均次數 4K | 1.93 | 1.83 | better |

**總 cross-zone 輪數（1080+4K 合計）：#53 前 12 輪、#53 後 26 輪 → 7112 型 prep 滲入 ready 在 #53 前即存在，#53 後惡化。**

**整體 verdict（30 輪真雲）：** main **WORSE**（集合 mismatch、4K missing>3s、cross-zone 均變差）；槽位級在穩定幀仍 **0 mismatch**（集合評分與 snapshot／sent 列表不一致時會假陽性，見 §2）。

原始 JSON：`real-cloud-compare-table.json`、`real-cloud-{4146812,0ed3056}-{1080,4k}.json`。

---

## 1) 重跑方式

| 環境 | 指令 |
|------|------|
| CI 真雲 | push / `workflow_dispatch` → `.github/workflows/pr53-live-cloud-diagnose.yml`（concurrency `live-cloud-zz-qa-ci-store`，結束 `teardownLiveCloudSession`） |
| 本地 fake-cloud | `node artifacts/pr53-live/run-local-compare.mjs`（10 輪，對照用） |
| RED | `node artifacts/pr53-live/run-red-repro.mjs` |

**禁止** `zz-qa-store-a`、`zz-qa-backend`。僅 `zz-qa-ci-store`。

---

## 2) QA 預期頁 & 槽位評分（已實作）

- **QA 集合**：`expectedPageSet(sentAsc, pageIndex)` + `.milksha-num`（與公網腳本相同）。
- **槽位（修正盲點）**：indicator **連續兩 sample 相同** 且 numbers layer **opacity≥0.99** 時，10 個 `.milksha-num-cell` 對 `runtime.getSnapshot()` 同頁 10 格；並檢查 `lastPageTenOld`（末頁應只有 N 格有字卻填滿 10 格）。
- **30 輪真雲結果**：槽位 mismatch **全程 0**；QA 集合 mismatch 仍高 → 多數為 **sent 列表 vs 雲端 snapshot 時序** 或 **寬鬆 `.milksha-num` 含 float** 造成集合假陽性；**cross-zone（7112 in ready）則為真實 DOM 污染**，與公網 QA 一致。
- 公網 `8101+7112` 的 expected **`{8101,8100}`** 算法正確。

---

## 3) 假設 1 驗證（apply 與 DOM）

每輪記錄：

- `applyPayloadCalls`（次數、時間戳、silent）
- `receiveBoardCalls`、`board_snapshot` timeline 條目
- 800ms 內每 50ms 一帧 prep/ready DOM（有 cross-zone 或 mismatch 時保留 `midFrames`）

**結論：**

- 每輪平均 **~1.8–1.9 次** `applyPayload`（非離線單次）；真雲仍比 fake-cloud 多路徑。
- **7112** 在 **4146812 與 0ed3056** 的 ready 穩定幀均出現（#53 前已有，#53 後 cross-zone 輪數增加）。
- 槽位與 snapshot 一致時仍見 prep 號在 ready → **cross-zone 非評分公式問題**。

---

## 4) 離線綠燈 vs 公網／真雲 FAIL

| 路徑 | 行為 |
|------|------|
| offline replay / 單元 e2e | 單次 `applyPayload`，槽位斷言 |
| fake-cloud 本地 | cross-zone **0**（10 輪） |
| **zz-qa-ci-store 30 輪** | cross-zone **12→26** 合計；7112 重現 |
| 公網 zz-qa-store-a | 同類 7112 症狀（10 輪） |

快取：`20261011c` only（公網 retest 已驗）。

---

## 5) 假設排序（更新）

1. **Cross-zone DOM（7112 in ready）為獨立於 indicator/snapshot 的動畫或 layer 殘留問題；#53 未消除且略惡化** — 真雲 30 輪已證；修復需產品層（本 PR 不動）。
2. **#53 延後 indicator 更新** — 4K missing>3s 16/30 WORSE；1080 略好。
3. **QA 集合分數在真雲偏高、槽位為 0** — 評分應以 **槽位+穩定 indicator** 為準，集合作輔助。
4. **~15.2s 主流程延遲** — 本次 30 輪腳本未含 22 票主流程；仍屬雲端／模擬佇列（與 #53 DOM 無直接關係）。
5. **4K 動畫時序** — cross-zone 4K 4→14 輪，與公網 4K mismatch 較多一致。

---

## 6) RED 重現

```bash
# fake-cloud（missing>3s only）
node artifacts/pr53-live/run-red-repro.mjs

# 真雲 7112（需 CI secret）
# → workflow pr53-live-cloud-diagnose.yml
```

---

## 附：本地 fake-cloud 10 輪（對照，非本次驗收）

| 指標 | 4146812 | 0ed3056 |
|------|---------|---------|
| missing>3s 1080 | 3 | 4 |
| QA 集合 mismatch 1080 | 2 | 0 |

見 `compare-table.json`（fake-cloud）。
