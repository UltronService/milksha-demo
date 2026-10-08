# PR #27 公開 QA — 交件報告（拆 PR 版）

## 兩個 PR（合併順序：產品 → QA）

| PR | 分支 | 範圍 | HEAD（推送後見 GitHub） |
|----|------|------|-------------------------|
| **產品** | [#30](https://github.com/UltronService/milksha-demo/pull/30) `cursor/board-device-command-seq-49e5` | 僅 `js/receiver/cloud-runtime.js` + `tests/cloud-runtime-device-command-seq.test.js` | `30e84f2` |
| **QA** | [#28](https://github.com/UltronService/milksha-demo/pull/28) `cursor/public-pages-qa-script-fix-49e5` | 公開 QA 腳本、`zz-deny-test` 檢查 d、報告；**不含** cloud-runtime | `70bc115` |

## 根因 (b) 與 seq 修法（產品 PR）

- **來源：** device 文件 `pendingCommand` 可帶 `boardSeq`；fake-cloud／本機 shim 亦在 device 根欄位寫 `boardSeq`（與後端 devCommand 回傳一致）。
- **作法：** `resolveCommandBoardSeq(cmd, deviceData)` 優先 `cmd.boardSeq` → `deviceData.boardSeq` → 僅在皆無時 `localSeq+1`。
- **為何不會擋掉之後真名單：** 本地 seq 對齊後端該筆指令 seq；`tryApplyTodayBoard` 對「較新 seq、空 tickets、畫面上仍有 ready」僅 **抬高 localSeq、不清空**（`stale_empty_cloud`），之後 seq 更大的非空雲端板仍會通過 `shouldAcceptBoard`。
- **未採用：** 送號後 250ms 強制 `pollBoard`（避免多餘 Firestore 讀取）。

單元測試：`tests/cloud-runtime-device-command-seq.test.js`（三情境：clear→push 後舊空板不清號、雲端新名單可套用、重複 pending 不重複套用）。

## 檢查 d — `zz-deny-test`（9940daf / deny 名單）

公開實測：`artifacts/pr27-zz-deny-d/report.json` — **連線暫停**、devLogin **403** `store_not_allowed`、idle 無迴圈。  
主腳本 d 為 **live** `zz-deny-test`；`c030020` route 僅 `routeSupplement`。

## 公開矩陣（a–e × fresh / legacy × 3 輪）

| 跑法 | 結果檔 |
|------|--------|
| `MILKSHA_QA_PATCH_RUNTIME=0`（Pages 現況，對照） | `artifacts/pr27-matrix/matrix-baseline-no-patch.json` |
| `MILKSHA_QA_PATCH_RUNTIME=1`（注入產品 PR 的 cloud-runtime） | `artifacts/pr27-matrix/matrix-with-patch.json` |

（執行紀錄：`artifacts/pr27-matrix/*.log`；若任一轮失敗，見 JSON 內 `items[].results` 與 `run.log`，**重跑不抵銷已記錄失敗**。）

## 測試規則

寫入僅 `zz-qa-*`；不在名單僅 `zz-deny-test`；不碰 `s120030`；`c030020` 只讀；不開新假店看板。

## devLogin 量（補充）

偏高為 QA 重跑；與卡 120s／`zz-deny-test` idle 0 次非同一根因。
