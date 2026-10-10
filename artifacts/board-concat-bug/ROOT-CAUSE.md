# 準備中號碼黏在一起（20392025）— Root Cause

**時間：** 2026-10-10（台北 16:48 回報）  
**分支：** `cursor/fix-board-concat-numbers-a2ca`  
**修復 ETA：** 同 PR 內完成（約 1 小時內含測試與 CI）

## 現象

準備區單格顯示 8 位數字（例如 `20392025`），實為兩個 4 位取餐號在**同一個 `.milksha-num-cell` 內並排**（flex + `inline-flex` chip），視覺上像一個號碼。  
`controller/store-simulation.js` 的 `formatOrderNo()` 只會產生 4 位字串，**不是資料來源問題**。

## 根因（已用 DOM 證明）

`js/board/milksha-board-anim.js` → `createBoardAnimator().syncZone()`：

1. 對 `diff.removed` 的 chip 啟動 **opacity 淡出**，chip **仍留在原 slot** 直到動畫結束（~300ms）。
2. **同一 tick** 內，新號碼若 occupy 同一 slot，會 `slot.appendChild(newChip)`。
3. 結果：一個 cell 內 **2 個 `.milksha-board-chip`**，`cell.textContent` 變成 `20252039` 這類拼接。

重現腳本（main 上）：先 push `2025/2022`，50ms 內改為 `2039/2038` → prep cell 0/1 各 2 chips，`text` 為 `20252039`、`20222038`。

## 修復方向

- 淡出開始時 **`detachChipFromSlotForFade`**：將 chip 移到 `.milksha-zone-numbers` 上絕對定位，**立刻釋放 slot**。
- 插入新 chip 前 **`evictExtraChipsFromSlot`** 防禦性清 slot。

動畫時長／曲線不變；淡出仍在原視覺位置完成。

## 暫時開關

預估修復 < 2 小時，**不需** feature flag。若需緊急止血：可設 `prefers-reduced-motion` 或現有 snapshot skip 路徑（會跳過 incremental anim），不建議長期使用。

---

## 後續（低優先，不阻塞本 PR）— 16:53 欄位溢位動畫

**需求：** 左欄超過 5 筆時，原「左下 → 右上對角」改為：左下 **向下滑出消失** → 新號從 **右欄正上方** 滑入右欄第 1 格；右欄其餘號碼同步 **下移一格**；右欄最底若需翻頁則 **向下滑出**。

**與本 bug 關係：** 共用 `syncZone` / slot diff / `animateTranslate`，但需新增「欄內垂直位移 + 跨欄進場」編排，與 detach/evict 修補正交。

**ETA：** bug fix 合併並上線後 **約 3–5 小時**（含 e2e 更新與 regression）。

**PR 策略：** **獨立 PR（自 `main`）**，不併入本 concat fix PR，以免延遲 production 熱修。

---

## 後續（低優先，不阻塞本 PR）— 16:55 號碼規則（雲端驗證 + 看板二次檢查）

**規則摘要：**

1. 看板只顯示 **恰好 4 位數字**（`/^\d{4}$/`）；不合者 **略過該筆** 並 `console.warn`，不 crash。
2. 同一列表內重複：只顯示一次。
3. 準備中與請取餐同號：只顯示在 **請取餐**。
4. 後端每列表上限 50；看板不必強制上限，但資料超量時仍須正常渲染。
5. Controller 店舖模擬器不得產出違規號碼（4 位、wrap、兩列表間不重複）。

**現況（main）：** `partitionNumberContent` 已做 (2) 部分去重與 (3)；缺 (1) 格式過濾與 warn；(5) 模擬器需加回歸測試／邊界確認。

**ETA：** concat fix **合併推送後** — 看板規則 **約 1.5–2 小時**；模擬器 + 全規則 unit/e2e **再加 1–2 小時**（合計 **約 3–4 小時**）。

**PR 策略：**

- **本 concat hotfix PR：** 僅含黏號修復 + 格內單一號碼測試（不加入號碼規則，避免延遲上線）。
- **下一 PR（自 `main`）：** 看板 `partitionNumberContent`（或等效入口）過濾 + warn；(2)(3) 測試補齊；e2e 餵非法 payload。
- **再一 PR 或同下一 PR 第二 commit：** `controller/store-simulation.js` 保證 (5) + 對應 unit 測試（若與看板 PR 分開，可並行 review）。
