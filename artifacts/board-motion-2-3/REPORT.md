# Board motion items 2–3 — delivery report

**Branch:** `cursor/board-motion-items-2-3-a2ca`  
**PR:** https://github.com/UltronService/milksha-demo/pull/52  
**Head (branch run):** `ae2fec1`  
**Main baseline (compare):** `4146812` (origin/main)

## QA handoff（台北 21:30）

依附件《叫號機看板動態驗收清單》（2026-10-11 20:50 版，**容許值 0**）交接：

1. **自動化已跑一輪**（本 branch + main 對照）：50ms 取樣、board 座標 cream／標題 guard、重疊、斜移；證據 JSON／截圖在 `artifacts/board-motion-2-3/qa-acceptance/`（**未 bump asset**）。
2. **請 QA 補人工項**：清單 **A.5** 真 60fps 影片、**B** 尖峰 10 分鐘、舊版快取、zz-qa 雲端、c030020／clear_now（代理未做）。
3. **今晚目視重點**：反向補位（右上下滑出 → 左下由**下方**進場）動畫中，左欄最下格號碼是否**穿出 cream 白框下緣**；#46 第 6 顆進場時是否**蓋到「準備中／請取餐」**。
4. **UAT 快速路徑（local POC）**：`http://127.0.0.1:8877` 看板 → 依 `board-motion-backfill-boundary.spec.mjs` 情境灌 7 筆再刪中間一筆；1080p／4K 各看一次左下進場中段。

---

## Animation acceptance（checklist A, tolerance 0）

**Runner:** one-off `scripts/qa-accept-run-once.mjs`（未提交）；對照 `results-{branch,main}.json`。

| # | 檢查項（A） | Branch `ae2fec1` | Main `4146812` | 備註 |
|---|-------------|------------------|----------------|------|
| A.1 | 動態全程 50ms DOM 取樣 | Pass（已執行） | Pass（已執行） | 每情境 30–61 frames |
| A.2a | 號碼在白框內（cream 四邊） | **Fail** 5/5 情境 | **Fail** 5/5 情境 | 見下方情境表 |
| A.2b | 不蓋標題區（TITLE_GUARD） | **Fail** | **Fail** | **pre-existing on main**（#46 欄位移動：6201／6701 曾 top=-43.7，main／branch 同證據） |
| A.2c | 號碼互不重疊 | **Fail** | **Fail** | **pre-existing on main**（欄位移動 6206×6205 等，兩邊皆有 overlapHits） |
| A.2d | 不斜移（Δx、Δy 不同時非 0） | **Fail** 部分 | **Fail** 部分 | backfill／4K：main 亦有 `store:5201` diagonal；branch ready backfill 亦有 |
| A.4 | 1080p + 4K + 請取餐 1.3× 窗 | 已覆蓋 | 已覆蓋 | pulse 窗 3.2s 取樣 |
| A.5 | ≥60fps 影片 | 部分 | 部分 | Playwright `recordVideo` → `qa-acceptance/video-*/`（非保證 60fps；需 QA 補錄） |

### 情境結果（A.2 綜合 pass/fail）

| 情境 | Branch | Main | 失敗性質 |
|------|--------|------|----------|
| 反向補位 prep 1080p（左下由下方進場） | **Fail** | **Fail** | Branch：**cream-bottom**（5201 bottom≈1322，cream 下緣 980）+ 蓋標題 + 重疊；Main：**無 cream** 違規，**pre-existing** 重疊／斜移（`results-main.json` 首段） |
| 反向補位 ready 1080p | **Fail** | **Fail** | Branch：cream-top／**cream-bottom** + 標題 + 重疊；Main：重疊／斜移 **pre-existing** |
| 反向補位 prep 4K | **Fail** | **Fail** | 兩邊皆有 **cream-bottom**（如 5213 bottom≈1620）；**pre-existing on main**（`results-main.json` L187+） |
| 左欄溢位 prep 1080p（#46） | **Fail** | **Fail** | **pre-existing on main**：6201 top=-43.7、title-guard（`column-prep-1080-fail-main.png`） |
| 左欄溢位 ready + pulse 1080p | **Fail** | **Fail** | **pre-existing on main**：6701 同帧 top=-43.7 |

### 反向補位：左下「由下方進場」是否穿出 cream 下緣？

**結論（branch）：是。** 在 prep 1080p 反向補位動畫中，左下進場路徑上量到 **cream-bottom** 違規（board 座標 bottom **1321.7** > prep cream 下緣 **980**），截圖：`qa-acceptance/backfill-prep-1080-fail-branch.png`；raw：`qa-acceptance/results-branch.json`（`Reverse backfill prep 1080p` → `creamHits` / `cream-bottom`）。

Main 上同 prep 1080p 情境**未**量到 cream 越界（補位動畫路徑不同／較短），但仍有重疊／斜移 fail → 不算「僅 branch 問題」，但 **cream 下緣穿出為 branch 實作路徑上新增的可視風險**，需 QA 目視確認是否可接受或需收斂進場軌跡。

---

## Reverse backfill boundary 1–10 (TDD)

| # | Test | Red cause | Green fix |
|---|------|-----------|-----------|
| 1 | prep right-top slides up/out | Wrong payload (`prepPayload` on rows); short poll | Apply `zoneRows` directly; exit-clone slot sampling |
| 2 | prep enter left-bottom from below | Same payload bug | `chipMotionSampleLeftBottomMotion` + long poll |
| 3 | prep other right chips slide up | Follower hidden during FLIP / slot probe | `chipMotionSampleColumnSlot` at slot 6 |
| 4–6 | ready mirror of 1–3 | Same | Same helpers on ready zone |
| 7 | both zones vertical / no overlap | `getBoundingClientRect` column leak vs transform | Transform `tx` while visible; hide during backfill skip-FLIP |
| 8 | one chip per cell | — | Already green once payload fixed |
| 9 | settle order + opacity 1 | — | `assertZoneSlotOrderExact` |
| 10 | 1080p + 4K contact sheets | — | `artifacts/board-motion-2-3/screenshots/backfill-prep-{1080p,4k}.png` |
| + | page-2 fade right-bottom | Moved chip skipped CSS fade; short sample | `pageTwoFadeInIds` + `scheduleChipCssFadeIn`; slot opacity poll |

Spec: `tests/e2e/board-motion-backfill-boundary.spec.mjs`  
Helpers: `tests/e2e/board-motion-backfill-helpers.mjs`

## Items 2–3 + QA

| Item | Spec / unit |
|------|-------------|
| 2 in-place leave fade | `board-motion-items-red.spec.mjs` |
| 3 no overlap | same + `board-motion-backfill.test.js` |
| QA #46 opacity interrupt | `snapOpacity(1)` after skip-FLIP |

## Local verification

```text
npm test → 211 pass
npx playwright test tests/e2e/board-motion-backfill-boundary.spec.mjs → 11/11
npx playwright test tests/e2e/board-motion-items-red.spec.mjs → 2/2
npx playwright test tests/e2e/board-column-move.spec.mjs → 20/20
```

Asset: **`20261011k`**（本輪 QA 文件更新 **未 bump**）

## CI

- **SHA:** `ae2fec1`（e2e 取樣修正）；PR #52
- **Checks:** 見 Actions；訂閱 branch CI 待 green
