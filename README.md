# 迷客夏取餐叫號看板（展示站）

靜態網站，供門市 STB／大螢幕展示 **迷客夏** 雙區叫號：左（或上）**可取餐**、右（或下）**準備中**。資料來源標籤（現場／迷點／熊貓／Uber／UDD）、分區獨立 6 秒換頁、新可取餐全螢幕提示與提示音（每批最多 3 響）等行為與內部規格一致。

## 正式網址

<https://ultronservice.github.io/milksha-demo/>

## 使用方式

| 網址參數 | 說明 |
|----------|------|
| （無參數） | 純看板，無任何控制列 |
| `?demo=1` | 顯示右下角「展示」抽屜：模擬推送、自動播放（5／8／10 秒）、手動加號、清空、靜音、重置劇本、橫／直版切換；快捷鍵 `D` 開關面板、`空白` 下一步、`A` 自動播放 |
| `?orientation=landscape` | 強制橫式 1920×1080 版型 |
| `?orientation=portrait` | 強制直式 1080×1920 版型 |
| 未指定 orientation | 依瀏覽器視窗寬高自動選橫／直 |

範例：

- 現場看板：<https://ultronservice.github.io/milksha-demo/>
- 展示／驗收：<https://ultronservice.github.io/milksha-demo/?demo=1>
- 直式預覽：<https://ultronservice.github.io/milksha-demo/?demo=1&orientation=portrait>

## 本機預覽

```bash
npx --yes serve -l 4173 .
# 開啟 http://localhost:4173/?demo=1
```

## 測試

```bash
npm test
```

## 目錄摘要

- `index.html` — 看板入口
- `brand.json` — 品牌與版型設定
- `js/` — 看板、音效、展示控制
- `demo/milksha-demo-script.json` — 展示用逐步劇本
- `docs/milksha-callboard/` — 規格與線框說明

## 部署

推送到 `main` 時，GitHub Actions workflow `.github/workflows/deploy-pages.yml` 會將整站靜態檔部署至 GitHub Pages。
