# 靜態資源 cache-bust 版本（#48 後 STB 快取）

## 問題
#48 合併後 `js/milksha-board.js`、`css/milksha-board.css` 已變，但 `index.html` 仍為 `?v=20261009a` 等舊值，機上盒沿用快取，指示器仍像舊版（左上角）。

## 作法
- **單一來源：** `config/asset-version.json` → `20261011a`
- **入口 HTML：** `index.html`、`controller/index.html`、`receiver-demo/index.html` 內所有 `.js`/`.css` 的 `?v=` 一律等於該版本（receiver-demo 補上原本缺少的 `?v=`）。
- **CI / `npm test`：** `tests/asset-version.test.js`
  1. 掃描入口 HTML，任一 `?v=` 不符即失敗。
  2. 相對 `origin/main`：若 diff 含 `js/`、`css/`、`controller/*.js|css`、`config/firebase.js` 且 **`config/asset-version.json` 未變** → 失敗。

## TDD
| 步驟 | 結果 |
|------|------|
| 僅加 manifest + 測試、尚未改 HTML | `HTML entry ?v= matches…` **失敗**（89 處不符） |
| 本地改 `js/app.js` 但不 bump manifest | `js/css changes vs origin/main…` **失敗** |
| bump `20261011a` + 三入口 HTML | `npm test` **203/203 通過** |

## 文件
- `README.md` 測試小節、`CONTRIBUTING.md` 各一行提醒 bump 規則。

## 未改
- `js/board/milksha-board-anim.js` 邏輯未動（僅 HTML 上 anim 檔的 `?v=` 與其他檔同步）。
