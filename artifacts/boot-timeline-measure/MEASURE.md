# Boot timeline measure

| 項目 | 值 |
|------|-----|
| PR #34 | **MERGED** @ `c8d8174ceb4f1909111cbd6d9e1bd3170b32cf9f` |
| 量測站 | https://ultronservice.github.io/milksha-demo/ （`Last-Modified` 2026-10-09，含 #34） |
| 店號 | `zz-qa-store-a` / `stb-01` |
| 腳本 | `node scripts/boot-timeline-measure.mjs` |
| 輸出 | `results.json` |

**全新**：每輪新 browser context，init 清除 `milksha:auth:*`。  
**舊設定**：同一 context 連續 3 次導航；第 2–3 輪應 `devLogin HTTP×0`。
