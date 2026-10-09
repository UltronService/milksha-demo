# Boot-fast self-QA（PR #34：項目 1–7）

| 項目 | 值 |
|------|-----|
| **PR** | https://github.com/UltronService/milksha-demo/pull/34 |
| **HEAD** | `REPLACE_HEAD_SHA` |
| **CI** | `REPLACE_CI_RUN` |
| **矩陣腳本** | `node scripts/boot-fast-self-qa.mjs`（`MILKSHA_BOOT_ROUNDS=5`）→ `live-matrix.json` |
| **Ack 腳本** | `node scripts/boot-fast-command-ack.mjs`（`MILKSHA_ACK_ROUNDS=3`）→ `command-ack-matrix.json` |
| **寫入店** | `zz-qa-store-a`（未開新店） |

> **數字唯一來源**：本檔所有 ms 指標均取自 `artifacts/boot-fast-self-qa/live-matrix.json` 的 `summary`／`runs`，與摘要表一致。

**產品決策（本 PR）**：控制端「看板在線」耗時 **不擋合併**；控制端僅 **4s** `pollDevice`（已移除實驗性 fast-probe，避免常態增加 Firestore 讀取）。單元測：`tests/controller-polling.test.js`。

---

## 1. 真雲端矩陣（歷史一輪；本輪未重跑）

`live-matrix.json` 的 `headSha`：`370d1f19c501f5239b961942b0621c99d4e7abc8`。本輪 **未重跑** 矩陣（交付優先 CI）。

### Chromium

| 指標 | 本分支 | `5765abf` (#32) | `7fb4f9c` (pre-#32) |
|------|--------|-----------------|---------------------|
| `boardFirstPaintMs` median / max | 3619 / 3880 | 3093 / 5545 | 3344 / 3571 |
| `controllerBoardOnlineMs` median / max | **4888 / 5212** | **4734 / 7400** | 120140 / 120146 |
| `sendToDisplayMs` median / max | 59 / 73 | 59 / 61 | 52 / 57 |

### Firefox

| 指標 | 本分支 | `5765abf` | `7fb4f9c` |
|------|--------|-----------|-----------|
| `boardFirstPaintMs` median / max | 4129 / 5125 | 4146 / 4659 | 4558 / 4612 |
| `controllerBoardOnlineMs` median / max | **5464 / 6171** | **5441 / 5745** | 120210 / 121659 |
| `sendToDisplayMs` median / max | 98 / 100 | 86 / 101 | 94 / 103 |

### 結論（項目 1）

- 與 **#32 合併點 `5765abf`** 比：本分支 `controllerBoardOnlineMs` Chromium 中位數 **略慢 ~154ms**（4888 vs 4734），Firefox 中位數略慢 ~23ms；**未達「明顯快於 #32」**。
- 與 **pre-#32 `7fb4f9c` 整包 archive** 比：控制端在 120s 內無法 `#online-state[data-connected="1"]`（見下），**無法用同腳本得到有效的 `controllerBoardOnlineMs` 對照**；板端 `devLogin`／首包心跳仍約 2–2.5s，與 #32 同量級。
- **板端**：`kick()` 不阻塞 auth；瓶頸仍在 **心跳成功 → 控制端 4s `pollDevice` 判定 `deviceOnline`**（見 phase）。

### 1b. Phase 中位數（ms，自看板 `goto` 起算）

| Phase | 本分支 Cr | 5765abf Cr | 本分支 Ff | 5765abf Ff |
|-------|-----------|------------|-----------|------------|
| → `devLogin` 完成 | 2476 | 2004 | 3037 | 2538 |
| → 首次 `heartbeat_ok` | 2744 | 2587 | 3507 | 3623 |
| `heartbeat_ok` → 控制端板在線 | **2159** | **2100** | **1984** | **1762** |

**最久段**：`heartbeat_ok` 之後到控制端顯示板在線（約 **1.8–2.2s**），對應控制端 **4s** `pollDevice` + 雲端 `readDevice`／`lastHeartbeat` 可見性（本 repo 不改 milksha-cloud）。

### 1c. `7fb4f9c` 控制端 120s 逾時

Archive 的 `7fb4f9c` **controller** 在真雲端下 **120s 內連不上** `data-connected="1"`，但同輪 **board** 心跳約 2.5s 成功。判定為 **舊版控制端與現行雲端登入／連線流程不相容**（非本 PR 板端邏輯）。退化對照以 **`5765abf` + 板端 phase** 為主。

---

## 2. 異常點（不剔除）

### `sendToDisplayMs` 2868（`b65a2b8` 矩陣 `branch-chromium-1`，仍列入歷史證據）

| 欄位 | 值 |
|------|-----|
| `realtimeAttachedMs` | 3789 |
| `controllerBoardOnlineMs` | 7272 |
| `commandMode` | `control` |
| `controlAfterBoardMs` | 0 |

**原因**：監聽已 attach，但該輪 **控制端 `deviceOnline` 仍依 4s 輪詢**；`controllerBoardOnlineMs` 7272 主要來自 **心跳 OK 後 ~3.5s+ 才第一次命中 `pollDevice` 的 `boxOnline`**。送號走 POS／雲端寫板後，板端以 **Firestore snapshot／REST** 顯示；該輪 snapshot 合併較慢，**2868ms** 為寫入＋板端收到內容的尾延遲（非腳本排除）。

### `controllerBoardOnlineMs` 7272（同上輪）

與上同源：`heartbeat_ok` 早於控制端 UI 變綠；**非 Firebase SDK 卡死**，而是 **控制端查在線間隔 + 雲端 device 紀錄更新**。

### 本輪 5 輪矩陣內

- `v5765abf-chromium-5`：`controllerBoardOnlineMs` **7400**（`commandMode=poll` 該輪），仍計入 max。
- `branch-firefox-3`：**6171**（`commandMode=control`），計入 max。

---

## 3. 項目 5 — 真雲端 `ackCommandId`（`command-ack-matrix.json`）


| 瀏覽器 | 輪次 | 指令 | ackCommandId（timeline 首筆） | ok |
|--------|------|------|---------------------------|----|
| chromium | 1 | clear_now | `3533f44b-02c1-4cf5-89ab-811411c7a152` | ✓ |
| chromium | 1 | slow | `7d935b54-496f-4587-ac8a-c641bf624ff5` | ✓ |
| chromium | 1 | simulate_offline | `caaca2c9-60dd-4988-9401-7630615822d5` | ✓ |
| chromium | 1 | restore | `a96df2e4-32ff-4256-ad5e-88b76c4d7285` | ✓ |
| chromium | 1 | push_numbers | `—` | ✗ |
| chromium | 1 | reload | `12bce7a0-d6bb-44ef-abbb-098e3b983c66` | ✓ |
| chromium | 2 | clear_now | `45532571-ebca-4b04-9850-89317e6596ba` | ✓ |
| chromium | 2 | slow | `b3e9a1d8-7b93-4791-938b-50a157abf10c` | ✓ |
| chromium | 2 | simulate_offline | `57bbe070-eda2-4903-9ed8-3fd421283da5` | ✓ |
| chromium | 2 | restore | `d394010a-3013-468e-b9ab-05040082a4d7` | ✓ |
| chromium | 2 | push_numbers | `—` | ✗ |
| chromium | 2 | reload | `4c403a96-674b-4e81-b0bf-92c0e1d74eba` | ✓ |
| chromium | 3 | clear_now | `98322f4f-cedd-4f24-8d05-c5ba0ae5f7b2` | ✓ |
| chromium | 3 | slow | `5be67be8-9dc3-4b92-bc92-87e5b44d5749` | ✓ |
| chromium | 3 | simulate_offline | `6f501d6c-9206-45bf-b267-38e39c3d53bd` | ✓ |
| chromium | 3 | restore | `417b17d1-4b3b-440c-8750-6fa71e680b09` | ✓ |
| chromium | 3 | push_numbers | `—` | ✗ |
| chromium | 3 | reload | `e82b4195-8464-41d6-b489-ebeeb5dc58bd` | ✓ |
| firefox | 1 | clear_now | `a45d2ea6-ee99-4cf5-8ef5-b97e79a151c4` | ✓ |
| firefox | 1 | slow | `a45d2ea6-ee99-4cf5-8ef5-b97e79a151c4` | ✓ |
| firefox | 1 | simulate_offline | `14f650ed-106c-4a5d-8a5e-d74862d72fdf` | ✓ |
| firefox | 1 | restore | `83b68dfd-ae38-45e1-8a13-d6353ba9d65a` | ✓ |
| firefox | 1 | push_numbers | `—` | ✗ |
| firefox | 1 | reload | `a23f1a73-b412-4487-8cb7-94d940ea067b` | ✓ |
| firefox | 2 | clear_now | `31d1f9a0-c481-434a-99b3-6eea90586cf9` | ✓ |
| firefox | 2 | slow | `31d1f9a0-c481-434a-99b3-6eea90586cf9` | ✓ |
| firefox | 2 | simulate_offline | `7b5df6ab-31b2-4d45-96e3-1604bbd9a978` | ✓ |
| firefox | 2 | restore | `617637bf-23a9-48af-af4e-298c0de4ba65` | ✓ |
| firefox | 2 | push_numbers | `—` | ✗ |
| firefox | 2 | reload | `02beca63-a830-4a01-ae80-69aaa432bc87` | ✓ |
| firefox | 3 | clear_now | `207c3edf-3aa6-4fb2-9d19-6dfd873ff92b` | ✓ |
| firefox | 3 | slow | `3678a1cf-de0a-40c8-be48-8bf99fdb1f34` | ✓ |
| firefox | 3 | simulate_offline | `91902741-090e-4743-9bc8-9934b902b489` | ✓ |
| firefox | 3 | restore | `dc9347ad-8e10-4306-86b7-41c2b54afbf9` | ✓ |
| firefox | 3 | push_numbers | `—` | ✗ |
| firefox | 3 | reload | `a0dac419-7882-4638-951a-b90027066098` | ✓ |

**`push_numbers`（不當缺陷）**

依 `docs/realtime-board-contract.md`：叫號名單主路徑為 **`today_board` `onSnapshot`**；`boxHeartbeat.ackCommandId` 用於 **裝置指令**（`control/pending`／`pendingCommand` 執行後）。

- 板端 `cloud-runtime.js` 的 `push_numbers` **若**從 `pendingCommand` 進入 `handleCommand`，會套用並 ack。
- 控制端雲端叫號走 `devCommand`／POS 後，真雲端實測 **號碼已上屏** 但無 `ackCommandId`，與 **雲端直接更新看板文件、不經裝置待執行 pending** 一致。

**驗收**：叫號 **不適用 ack，以上屏為準**。表中 `push_numbers` 的 ✗ 僅表示「無 heartbeat ack」，非功能缺失。


### 上次 Chromium `clear_now` 無 ack 的實際錯誤（修前）

單元測 `tests/cloud-runtime-command-ack.test.js`：`clear_now` 執行時 **`applyPayload` 拋錯** `Error: apply_failed`，`handleCommand` 中斷後 **未送** `boxHeartbeat.ackCommandId`。修後：`sendHeartbeatForCommandAck` + `finally`；真雲端本輪 `clear_now` 各輪均有 timeline／network ack（見 JSON）。

---

## 4. 項目 3(c) — `cloud-qa-checklist` 8 秒

`tests/e2e/cloud-qa-checklist.spec.mjs`：背景分頁後送號／上屏 **`timeout: 8000`**；`tests/e2e/controller-no-board-online.spec.mjs` 同 **8000**。

---

## 5. 項目 6 — `number_content` 順序（舊→新）

POS／`push_numbers` 的 `number_content` 為 **陣列下標順序**：**後送出的一筆 index 較大＝較新**。`milksha-board.js` 在 `applyPayload` 寫入 **`payloadIndex`**；排序 `compareNewestFirst` 在同毫秒 tie 時以 **payloadIndex DESC**（左上最新）。同批共用 `readyAt` 時，若只比時間會變成輸入序（舊→新），故用 index 對齊 **POS／雲端送出順序**。

**測例**：`tests/milksha-board.test.js` — `staggered arrival then batch keeps newest-first without jumping`（舊號先到→同批多筆→再送同批模擬重連，順序 **2012, 2011, 2003** 不跳動）。

---

## 6. 程式變更摘要

| 區塊 | 變更 |
|------|------|
| `js/receiver/cloud-runtime.js` | REST `kick`、並行 listen、`clear_now` ack、timeline |
| `controller/controller-app.js` | `data-board-online` 雙寫；僅 **4s** 輪詢（無 fast-probe） |
| `scripts/boot-fast-self-qa.mjs` | 三版本、phase、baseline 不誤等 timeline |
| `scripts/boot-fast-command-ack.mjs` | 6 指令 ack 矩陣 |
| `js/milksha-board.js` | `payloadIndex` tie-break |

---

## 7. 手動驗收（UAT）— 本輪不交 QA

1. 開 `zz-qa-store-a` 板＋控制端雲端模式，確認板在線 &lt; 8s（一般情況）。
2. 控制端送號，左上最新號正確。
3. `clear_now` 後 log／雲端 pending 清除，板清空。

---

## 剩餘／風險

- **控制端板在線時間**：已列為不擋 PR；歷史矩陣見 §1。
- **`7fb4f9c` archive**：舊控制端與現行雲端登入不相容，同腳本無法連線（僅說明，不再量測）。
