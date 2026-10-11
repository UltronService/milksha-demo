# Real-cloud RED 實跑紀錄

| 項目 | 值 |
|------|-----|
| Workflow | `Cross-zone leak RED (real cloud)` |
| Run | https://github.com/UltronService/milksha-demo/actions/runs/38182993862 |
| Branch | `cursor/cross-zone-leak-diagnose` @ `a632def` |
| Store | `zz-qa-ci-store` |
| Site SHA | `4146812`（git archive） |
| 輪數 | 30 × 1080p |
| **腳本 exit** | **1（RED）** |
| 唯一違規 | 3（皆 `7112` @ ready slot **1**，cycle 27–29） |

## 代表失敗幀（cycle 27, t≈361ms）

- **號碼 / 區 / 槽位：** `7112` / ready / slot **1**（slot0=`8101`）
- **indicator：** ready `2/2`（prep 已 `4/4`）
- **進行中動畫：** ready **layer-float×10**（`milksha-board-anim.js` page-turn / float clone 路徑）
- **snapshot：** `getSnapshot().ready` **已含** `7112`（state 層級錯誤，非純 DOM 殘影）
- **applyPayload 直前（末 8 次）：** 見 `real-cloud-red-failing-frames.json` → `applyPayloadJustBefore`（每筆含 `t,len,prep,ready,silent`）

## 調整說明

- **10 輪** 單次 GHA（run `38182681355`）**未**抓到 leak → 改 **30 輪** + **prep `7xxx` in ready slot** 症狀偵測後 RED 穩定重現。
