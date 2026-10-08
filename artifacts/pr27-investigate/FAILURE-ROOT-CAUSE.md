# 公開 QA「雲端偶發」失敗 — 根因分類（看板程式 **(b)**）

## 已合併修復（PR #30，`js/receiver/cloud-runtime.js`）

1. **清空→送號 seq 競態**：`resolveCommandBoardSeq` 以 **`cmd.boardSeq` / 雲端 `today_board.seq`** 為準，避免 heartbeat 落後的 `device.boardSeq` 讓**較新 seq 的空板**蓋掉剛顯示的號碼。
2. **新店 404**：missing `today_board` **不再遞增 `localSeq`**。
3. **晚到的 `clear_now`**：若 **`issuedAtMs` 早於已顯示的 `today_board.updatedAt`**（或雲端已有較新含號板），**忽略套用**並 **heartbeat ack**；合法清空不自行 `localSeq+1`。

**分類： (b) 看板程式** — 非 (a) 腳本讀錯店、非 (c) devCommand 常態 5xx。

---

## 歷史症狀（合併前）

`pollBoard()` 讀到**較新 seq 的空名單**時仍接受 → DOM 被清空；或 stale `clear_now` 晚到清號。與 QA `waitForFunction` 短暫看到號碼後 `aCount=0` 一致；`#milksha-cloud-paused` 通常仍 hidden（非 403 暫停）。

---

## 1) legacy-key、c 第 1 輪 — zz-qa-store-a 無號（歷史）

**來源：** `artifacts/pr27live/results.json`（old-settings check c round 1，合併前）

| 時間序 | 事件 |
|--------|------|
| T1 | `clear_now` → devCommand **200** |
| T2 | `push_numbers` → devCommand **200** |
| T3 | 看板短暫顯示號碼 |
| T4 | `pollBoard` 讀到 **較新 seq 空板** → DOM 清空（**(b)** seq 競態） |

---

## 2) d→c 探針（歷史）

Deny 分頁 403 後 zz-qa 隔離；round 3 仍可能觸發 **(b)** seq 競態（合併 #30 後應消除）。

---

## QA 腳本（輔助，非根因）

- b 項送號改 **`zz-qa-store-a`**；**c030020 僅讀取檢查**（見腳本 PR）。
- `sendToDisplayMs` 在 **DOM 出號即停表**；c 項仍可用 `waitBoardMinReady`（400ms 穩定）。
- b 項 3s SLA 量測起點：**看板就緒 + 送號可按之後**（見 `B-TIMING-BREAKDOWN.md`）。

## 驗收

- 合併 #28/#30 後：`artifacts/pr27-pages-route-matrix/product-*.json`（fresh + legacy 各 3× a–e）。
