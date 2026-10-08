# 兩次「雲端偶發」失敗 — 根因與時間線（分類 **(b) 看板程式**）

## 共通機制

`handleCommand` 的 `clear_now` / `push_numbers` 以前用**未遞增的 `localSeq`** 呼叫 `applyNumberContent`。  
`pollBoard()` 從 Firestore 讀到**較新 seq 的空名單**時，`BoardSeq.shouldAcceptBoard(incoming, local)` 為真 → **把剛顯示的號碼清掉**。

症狀與 QA 一致：`waitForFunction` 已看到 `.milksha-ready`（~500ms），結尾 `aCount === 0`；`#milksha-cloud-paused` 仍 hidden，**不是 403 暫停**。

修復：`js/receiver/cloud-runtime.js` — `clear_now` / `push_numbers` 前先 `localSeq += 1`。  
單元：`tests/cloud-runtime-push-seq-race.test.js`。

---

## 1) legacy-key、c 第 1 輪 — zz-qa-store-a 無號

**來源：** `artifacts/pr27live/results.json`（old-settings check c round 1）

| 時間序（推論＋ DOM/網路型態） | 事件 |
|------------------------------|------|
| T0 | 同 context 已完成 a/b；`localStorage` 含 legacy 種子 + 多店 `milksha:auth:*:controller:*` |
| T1 | `clear_now`（ctrlA）→ devCommand **200**，看板 DOM 空 |
| T2 | `push_numbers`（ctrlA）→ devCommand **200**（`boardSeq` 遞增） |
| T3 | 看板 `pollDevice` 套用 `push_numbers` → DOM **短暫**出現 ready 號碼（`sendAMs≈755ms` 內 wait 通過） |
| T4 | `pollBoard` 讀到 **seq 較新、 tickets=[]**（clear 已寫入雲端、push 尚未反映）→ `tryApplyTodayBoard` 接受 → **DOM 清空** |
| T5 | 斷言 `aCount=0`、`bCount=1`（B 店正常） |

**devCommand：** push/clear 皆 200（非 **(c) 雲端未寫入**）。  
**心跳：** 未進 403 halt（paused hidden）。  
**分類：** **(b)** seq 競態；legacy 僅讓同 context 多店 auth 更慢，不改變機制。

---

## 2) d→c 探針 1/3 失敗（fresh-c-only run 1，round 3）

**來源：** `artifacts/pr27-investigate/report.json` — `dThenC[1]`, `freshCOnly[0]`

| 時間序 | 事件 |
|--------|------|
| T0 | 新分頁 `s999999` → devLogin **403** →「連線暫停」（**僅該分頁**；`authKeys` 無 zz-qa device token） |
| T1 | 關閉 deny 分頁；開 zz-qa a/b 看板 + 控制端；`waitBoardCloudReady` ~2s，paused **hidden** |
| T2 | Round 1–2：clear → push → 穩定顯示 |
| T3 | Round 3 preclear 後 `push_numbers` A → 再次 **T3–T4 競態** → `aCount=0`、`bCount=1`，`sendAMs≈499ms` |

**分類：** **(b)**，**非** d 造成的 403 污染（就緒時 paused=false；與 s999999 無關）。

---

## QA 腳本配套（(a) 輔助，非根因）

- `waitBoardMinReady`：400ms 穩定 + 可選 `receiverCloud.getLocalSeq()`（`public-pages-pr27-live-qa.mjs`）。
- 根因仍須 **(b)** 合併部署後，公開站 board bundle 才含 seq 修復。

## 驗收

- 合併 PR 並 Pages 部署後：`node scripts/public-pages-pr27-matrix.mjs`（fresh + legacy 各 3 次完整 a–e）。
