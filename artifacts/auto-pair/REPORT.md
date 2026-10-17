# Auto-pair 對齊 boardAutoPair（2026-10-17）

## 變更摘要
- 前端改為 `POST boardAutoPair`（無 Bearer）：初次 `{ brand, storeNumber, deviceId }`；有本地紀錄 `{ storeId, deviceId }`。
- 成功後 `customToken` → `signInWithCustomToken`，再啟動 cloud runtime（早於 devLogin）。
- 小字：`isFirstBind` + `shouldActivateBindHint`（`hint-ever`）+ `sessionStorage` 顯示旗標；`storeName`／`storeNumber` 用 API 回傳。
- fake-cloud：`boardAutoPair`、10 分鐘窗、`ok:false`、initial/read 計數、`/test/boardAutoPairNow`。

## 手動驗收（UAT）
1. 清站存後開 `/?mode=cloud&store=zz-qa-store-a` → 右下角出現「已綁定：門市名＋店號＋時間」。
2. F5 同頁 → 小字仍顯示；Network 僅 read 路徑（無 brand/storeNumber）。
3. 新開無痕（帶同 bind record + hint-ever）→ 小字不出現。
4. 未註冊門市 → 全頁「找不到目標叫號機」，無 bind record。

## 真雲端 e2e
待 dev 部署 `boardAutoPair` 後再跑（zz-qa-backend／stb-01）。

## 與核准規格需 PM 確認
- **acceptance 8**（`controller-redesign-acceptance.test.js`）仍要求 `js/board/*` 零 diff；本分支必然失敗，非功能回歸。
- **站牌 brand.json 為 milksha** 但 QA 門市為 `zz-qa-*`：初次仍送 `brand: "Milksha"` + `storeNumber` 為完整 storeId（依後端「storeNumber 已是合法 storeId 則直接用」）。
- **fake-cloud 初次配對** 僅接受已 `/test/registerStore` 的門市（不自動建店），與「找不到叫號機」語意一致；真雲端 profile 規則以 cloud 為準。
