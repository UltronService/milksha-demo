# Realtime board self-QA（分支 `cursor/realtime-board-4a4f`）

## 路線（2026-10-08 晚）

- **停止**：Playwright + Firebase Auth Emulator 瀏覽器整合（根因：Chromium 直連 `127.0.0.1:9099` 的 `signInWithCustomToken` 回 404，與 Node 同 URL 200 不一致；非產品邏輯）。
- **監聽證據**：單元測試（假 `onSnapshot` / fallback）+ `@firebase/rules-unit-testing` + 假雲端 e2e **poll 模式** + 真雲端公開矩陣（待 API key）。

## CI（`917cea5` 失敗摘要）

| 測試 | 錯誤 |
|------|------|
| `controller-actions.spec.mjs` › offline reconnect 5501 | `rcv-ready` 等 5501 15s 仍 0 元素 |
| `controller-actions.spec.mjs` › no Firebase SDK | `window.firebase` 為 true（receiver-demo 載入 SDK）→ **已修**：SDK 僅首頁 |
| `fresh-browser-pause-heartbeat` | `devLoginCalls` 期望 0 實際 1 → **已修**：`ensureFirebaseSignedIn` 改走 `ensureIdToken` 不重複 `devLogin` |

## 單元測試（監聽）

- `tests/firestore-realtime-listener.test.js`：`auth_failed` / `sdk_missing` → poll；`pendingCommandChanged`；seq+1 同號 normalize。
- `tests/cloud-runtime-realtime-flag.test.js`：`?realtime=0`。
- `tests/firestore-rules/realtime-board.rules.test.mjs`：Node + Firestore emulator。

## E2E 模式標註

- `home-board-realtime-emulator.spec.mjs`：假雲端 gateway，**預期 `boardListen=false`（poll）**，註解 `mode=poll`。
- `home-board-realtime-flag.spec.mjs`：`?realtime=0` 關閉 realtime。

## 真雲端矩陣

- 腳本：`scripts/realtime-board-live-matrix.mjs`（需 `MILKSHA_FIREBASE_API_KEY`）。
- 店：`zz-qa-store-a`；禁止 `s120030` / `c030020` 寫入 / `s999999`。

## 待辦

- [ ] 真雲端矩陣實跑 + 3s 送號
- [ ] Legacy Chrome 78 證據 + `SDK.md`
- [ ] 讀取次數估算
- [ ] `controller-actions` offline reconnect（同 seq 離線補 ready）— 與 realtime 無關，分支仍與 `917cea5` 同敗
