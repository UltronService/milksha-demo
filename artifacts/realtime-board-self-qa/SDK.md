# Firebase JS SDK (看板即時監聽)

| 項目 | 值 |
|------|-----|
| 版本 | **10.14.1** |
| 載入來源 | CDN `https://www.gstatic.com/firebasejs/10.14.1/` |
| 模組 | `firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js` |
| 橋接 | `js/transport/firebase-sdk-bridge.js`（單一 `initializeApp` + Firestore 實例） |
| 關閉即時 | URL `?realtime=0` → 與 main 相同 REST 輪詢 |

## 舊機／SDK 失敗退回

- e2e：`home-board-realtime-emulator.spec.mjs` 阻斷 `firebase-firestore-compat.js` → `boardListen=false`，頁面仍可 `pollDevice`。
- 生產：SDK 未載入或監聽 attach 失敗 → `enterPollFallback` / `enterCommandPollFallback`。
- **真雲端實測（Chrome 78 UA）**：`live-matrix.json` › `legacyChrome78` — 僅 Playwright **覆寫 User-Agent 字串**，引擎仍是當代 Chromium/Firefox，**不是**真實 Chrome 78 二進位。
- **官方支援環境（10.x / compat）**：Firebase 文件列為 Edge、Firefox、Chrome、Safari、iOS Safari 等現代瀏覽器；舊版需 polyfill（例如 Safari &lt; 10.1 需 `fetch` 才可用 Auth/Firestore）。來源：[Supported environments for the Firebase JavaScript SDK](https://firebase.google.com/docs/web/environments-js-sdk)。
