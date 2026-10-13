# board-column-move.spec.mjs:124 偶發失敗（diagnose）

## 重現命令

```bash
export FONTCONFIG_FILE="$PWD/tests/e2e/fonts/fontconfig-e2e.conf"
pass=0 fail=0
for i in $(seq 1 30); do
  if npx playwright test tests/e2e/board-column-move.spec.mjs -g "5 ready:" --reporter=line 2>&1 | tail -1 | grep -q "passed"; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
  fi
done
echo "pass=$pass fail=$fail rate=$(( fail * 100 / (pass + fail) ))%"
```

- 本機實測（main `cf59d1c`）：30 次 **25 過 / 5 敗 ≈ 17%**；20 次 **17 過 / 3 敗 ≈ 15%**。
- 背景 `stress-ng --cpu 2` 20 次：**16 過 / 4 敗 ≈ 20%**（與基線接近，CPU 壓力非主因）。
- 對照：`2 prep:` enter-from-above 同結構 30 次 **0 敗**（ready 專有）。

## CI 與 main 是否同一測試

| Run | 連結 | 失敗點 |
|-----|------|--------|
| main push | https://github.com/UltronService/milksha-demo/actions/runs/38132199296 | `board-column-move.spec.mjs:124` 同名案例 |
| PR #62 | https://github.com/UltronService/milksha-demo/actions/runs/38380727226 | 同上 |
| PR #62 | https://github.com/UltronService/milksha-demo/actions/runs/38385809447 | 同上 |
| PR #62 | https://github.com/UltronService/milksha-demo/actions/runs/38348750656 | 同上 |

## CI 失敗數字（共通）

- 斷言：`assertEnterFromAboveMotion` @ `board-column-move-helpers.mjs:133`。
- `enter` 取樣 28 帧皆相同：`opacity:1`、`transform:none`、`top:265.29`、`left:1034.70`、`float:false`。
- 無 `translateY < -8`、top 差 **0** → `fromAbove === false`。

## 假設（可能性由高到低）

### 1. `pollMotionSamples` 與 `applyPayload` 並行，取樣窗口錯位

- **內容**：poll 在 trigger 同一 tick 啟動；column-move 的 enter 常在 layout/`afterLayout` 之後才跑，448ms 窗口內常只剩已落位的 6701（`transform:none`）。
- **驗證**：`node artifacts/flaky-column-move/poll-order-experiment.mjs`（需先 `node tests/e2e/web-server.mjs`）— parallel **1/20** 過 vs trigger 後再 poll **17/20** 過。
- **不修程式的小實驗**：通過時 `sample-debug.mjs` 常見 `delta≈196`、`minTy≈-294`；失敗時 `delta=0`（與 CI JSON 一致）。

### 2. 取樣點正確（`store:6701`@slot5）但 WAAPI 已結束或未反映到 `getComputedStyle`

- **內容**：`animateColumnMoveEnterFromAbove` 結束會清 `chip.style.transform`；若 28×16ms 全落在動畫後，断言必敗。
- **驗證**：`node artifacts/flaky-column-move/raf-burst.mjs` 多帧 `animCount:0`；對照通過 run 的 `transform` 矩陣負 translateY。
- **小實驗**：把 diagnostic 的 `intervalMs` 改 8 或 32 看 pass 率是否變（只改 artifacts 腳本）。

### 3. ready 左欄溢出 + 新號 pulse 與 prep 路徑競態

- **內容**：ready 在 `columnMovePlan.addedId` 上額外 `scalePulseSet`；prep 同場景 0%  flake，ready ~15% flake。
- **驗證**：比較 `board-column-move.spec.mjs` test 2（prep）與 test 5（ready）重跑失敗率（已做）。
- **小實驗**：CI trace 失敗 run 看 `data-column-move-anim` 與 pulse 是否同 tick 完成。

### 4. slot5 在首帧為 null，過濾後有效樣本變少、更易全落在穩態

- **內容**：debug 常見 `i=0` 無 chip、`i≥1` 已穩定；`filter(Boolean)` 後仍 27～28 点但無位移。
- **驗證**：`artifacts/flaky-column-move/sample-debug.mjs` 看 `count` 與首帧 `itemId`。
- **小實驗**：改采 `chipMotionSampleForNumber(page,'ready',6701)` 對照 slot 索引（artifacts only）。

### 5. CI 環境偶發更慢/更快導致窗口偏移（次要）

- **內容**：與假設 1 疊加；stress 略升 fail 率但不明顯。
- **驗證**：同一 commit 多 run 失敗率方差；比對 runner 區域（northcentralus 等）。
- **小實驗**：GitHub `CI=1` 單跑需無佔用 8877，否則 webServer 啟動失敗（非本断言）。

## 診斷腳本（不改產品碼）

- `sample-debug.mjs` — 鏡像 poll 窗口與 pass 指標
- `poll-order-experiment.mjs` — parallel vs sequential
- `raf-burst.mjs` — rAF 密集取樣

Store：本 spec 走 fake cloud / local POC，**未使用** `zz-qa-store-a`；live cloud job 不含此檔。
