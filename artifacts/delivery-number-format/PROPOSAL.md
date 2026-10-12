# 外送／迷點號碼格式 — 看板端提案

> 僅文件與排版實測；**未改** `js`／`css`／`html`。  
> 範圍：**無動態版**（網址不含 `motion=on`）、橫向 1007 底圖格線。  
> 雲端草案：字元僅 **0–9、A–Z**（雲端先轉大寫）；**不含 `#` 時 3–5 字**；foodpanda 可選開頭 `#`；雲端存原值（含 `#`）。

---

## A) 第二道四碼檢查在哪

| 項目 | 內容 |
|------|------|
| 檔案 | `js/milksha-board.js` |
| 常數 | `BOARD_NUMBER_FOUR_DIGIT`（`/^\d{4}$/`） |
| 函式 | **`normalizeBoardDisplayNumber(raw)`** — 通過才回傳字串，否則 `null` |
| 呼叫點 | **`partitionNumberContent(numberContent)`** 迴圈內；失敗則 **`warnInvalidBoardNumberOnce(row.number)`** 後丟棄該筆 |
| 測試 | `tests/board-number-rules.test.js` |

---

## B) 能否改成依 `sourceType` 檢查

**可以。** `partitionNumberContent` 已先 **`parseSourceType(row.source_type)`** 得 `sourceKey`（`store`／`point`／`fp`／`uber`／`udd`），再在通過正規化後組 **`makeItemId(sourceKey, displayNumber)`**。

建議實作形狀（概念）：

1. 新增 **`normalizeBoardDisplayNumberForSource(sourceKey, raw)`**（或讓原函式多帶 `sourceKey`），在 **`partitionNumberContent`** 內 **`parseSourceType` 成功後**再正規化。
2. 雲端已大寫；看板 **`trim` 後再 `toUpperCase()`**（字母段），**`#` 是否保留**依 UI 定案（見 §2）。
3. **`parseSourceType` 失敗**（缺欄、未知前綴）：**丟棄該筆**並 warn（與現行未知來源相同）。
4. **缺 `source_type` 的舊資料**：`js/board/today-board.js` 的 **`ticketsToNumberContent`** 已預設 **`From_Store_Preparing`／`From_Store_OK`**；看板第二道建議 **同樣視為門市 `store` 四碼規則**，避免舊單被誤殺。
5. **Udd**：雲端未定前，建議 **暫用通用 3–5 英數（可選 `#`）**，與 Uber／熊貓對齊，待雲端定稿再收斂。

### 各來源正規化（對齊雲端暫定）

| sourceKey | 規則（通過後回傳「顯示用字串」） |
|-----------|----------------------------------|
| `store` | 恰好 **4 位數字** |
| `point` | 恰好 **3 位數字**（保留 `091`） |
| `fp` | 可選 **`#` + 3–5 位英數**；通過後 **存顯示值**（含或不含 `#` 依 UI） |
| `uber` | **3–5 位英數**（如 `C7458`），無 `#` |
| `udd` | 暫定同 uber／fp 通用段，標註待定 |

通用英數段（`fp`／`uber`／`udd` 非門市／迷點）：  
`^#?[A-Z0-9]{3,5}$`（先大寫再測；**`#` 僅允許一個且在開頭**）。

### 重複判定（取代現行「只看號碼」）

現行 **`readyNumbers`／`prepNumbers`** 用 **`normalized` 字串**去重 → 不同來源同號會互卡。

改為：

- **`dedupeKey = displayNumber.replace(/^#/, '')`**（去開頭 `#`）
- 集合鍵：**`` `${sourceKey}:${dedupeKey}` ``**
- **同來源** `#6406` 與 `6406` → **同一筆**（後到依 payload 順序／ready 優先規則）。
- **不同來源** 同 dedupeKey（如門市 `6406` 與熊貓 `6406`）→ **不算重複**。
- **`makeItemId`** 仍用 **顯示字串**（含 `#` 若 UI 保留），與 dedupe 分離。

格式錯誤：**維持** warn 一次 + 丟棄該筆。

---

## 1) 檢查規則變更摘要

- **改動點**：`js/milksha-board.js` — 常數、`normalizeBoardDisplayNumber`（或拆成依來源）、`partitionNumberContent` 去重 Set 鍵。
- **不再使用** 單一 `/^\d{4}$/` 擋全部來源。
- **JSON number 型別**：維持 **拒絕**（與後端 PR #19 一致）。

---

## 2) 排版風險（無動態、1920×1080／3840×2160）

### 實測方法

- 本地 `?mode=local&orientation=landscape`，**無 `motion=on`**。
- 兩區各 **10 格滿版**（4 碼假資料）；**578／C7458／#6406 或 6406／7112** 以 DOM 覆寫 `.milksha-num`（現行第二道仍擋外送格式，故用覆寫模擬通過後排版）。
- 字級：**81px**（`LandscapeArtLayout.NUM_FONT_PX`）；字型：**Arial, Arimo**；**`white-space: nowrap`**；格心對齊 cream 2×5。

### 解析度

1080p 與 4K 僅 **等比縮放 canvas**，**設計座標下字寬上限相同**（實測一致）。

### 欄寬與字寬（設計 px，右欄較窄）

| 區 | 右欄 ink 預算約 | 左欄 ink 預算約 |
|----|----------------|----------------|
| prep／ready | **~347** | **~397** |

| 樣本 | ink 寬約 | 右欄 |
|------|---------|------|
| `578` | ~130 |  OK |
| `7112` | ~166 | OK |
| `C7458` | ~232 | OK |
| `#6406` | ~222 | OK |
| `6406`（不顯示 #） | ~177 | OK |
| `WWWWW`（5 字最寬） | ~383 | **超出右欄**；左欄仍可能貼邊 |

- **換行／裁切**：CSS 不換行；過寬時 **視覺上往鄰欄溢出**（`overflow: hidden` 在 zone，非單格）。
- **等寬**：已用 **`font-variant-numeric: tabular-nums`**；**`#` 與 `W` 較寬**，熊貓含 `#` 比純數多約 **一個 `#` 寬（~45px）**。

### foodpanda 顯示 `#` 與否（請 UI 擇一）

| 方案 | 說明 | 截圖 |
|------|------|------|
| **保留 `#`** | 與雲端原值一致、與他牌 `#` 習慣一致 | `board-static-1920x1080.png`、`board-static-3840x2160.png` |
| **不顯示 `#`** | 格內較窄、與 dedupe 鍵一致感較強 | `board-fp-nohash-1920x1080.png`、`board-fp-nohash-3840x2160.png` |

**UI／UX 建議（既有設計優先）**：若無品牌硬性要求，**優先不顯示 `#`**（較不易頂到右欄邊界）；若營運要與 POS／熊貓單一致，**保留 `#`** 仍安全（`#6406` 實測未爆）。

### Uber 長度建議（雲端未定長度）

- 雲端 **不含 `#` 3–5 字** → **`C7458`（5 字）為上限樣式**，實測 **右欄 OK**。
- 若將來放寬到 **6–7 字**（如 `C123456`），ink ~322px **仍略小於右欄 347px**；**8 字約 367px 會超右欄**。
- **建議**：Uber 與雲端對齊 **最多 5 字英數**；若要 6 字，僅放 **左欄格** 或 **縮字**（需另開視覺提案，本次不建議改 CSS）。

### 是否要縮字／等寬

- **3–5 字實例不需縮字**。
- 維持現有 tabular-nums；**不建議**為外送單開新等寬字型（偏離現有 Arial 規格）。

---

## C) 一格最多幾個字元（1080p／4K 相同）

以 **右欄（最窄）**、**81px Arial**、**實測 ink 寬 ≤ ~347px** 為準：

| 字元類型 | 最多字元數（右欄） |
|----------|-------------------|
| 純數字 `8` | **7** |
| `#` + 數字 | **`#` + 6 個數字**（7 字元總長） |
| `C` + 數字（Uber 型） | **7**（如 `C123456`） |
| 純大寫 `W`（最寬） | **4**（`WWWW` 約 306px；**5 個 W 超標**） |

**業務規則 3–5 字（不含 `#`）** 遠小於上述物理上限；瓶頸在 **將來若允許全 `W` 測試字** 而非正常外送號。

左欄可多約 **1 個窄字元或 1 個 `W`**。

---

## 3) 看板端 TDD 邊界（公開行為，建議 5 條）

1. **`store` + `'7112'`** → 顯示；**`'711'`／`'71122'`** → 不顯示且 warn 一次。  
2. **`point` + `'091'`** → 顯示 **`091`**；**`'91'`** → 不顯示。  
3. **`fp` + `'#6406'`** 與同批 **`'6406'`**（同 `From_FoodPanda_*`）→ **只留一筆**（ready 優先於 preparing 規則不變）。  
4. **`uber` + `'c7458'`** → 正規化顯示 **`C7458`**；**`'C74589'`（6 字）** → 依雲端若限 5 字則拒絕。  
5. **門市 `'6406'` + 熊貓 `'6406'`**（不同 `sourceKey`）→ **兩筆皆保留**（新 dedupe 鍵）。

（加：**缺 `source_type` 的 ticket 經 today_board 轉成 Store 後仍走四碼**。）

---

## 4) 實作預估（核准後起算）

| 項目 | 預估 |
|------|------|
| Cursor 代理人（規則 + dedupe + 測試 + 可選 # 顯示開關） | **約 2～3 小時** |
| 交 QA（台北時間） | **當日 22:00 前**（若 **平日 18:00 前**核准）；否則 **次一工作日 11:00 前** |

---

## 手動驗收（UAT）— 規則上線後

1. 開看板 `?mode=local`，確認 **無** `motion=on`。  
2. 控制器推送：迷點 `578`、Uber `C7458`、熊貓 `#6406`、門市 `7112`。  
3. 四筆皆出現在準備中或可取餐（依狀態）。  
4. 再推同來源 `#6406` 與 `6406` 各一次 → **畫面仍一筆**。  
5. 門市 `6406` + 熊貓 `6406` → **兩筆都在**。  
6. 推 `123`（門市）→ **不出現**，開發者工具 **最多一則** dropped warn。

---

## 截圖路徑

- `artifacts/delivery-number-format/board-static-1920x1080.png`
- `artifacts/delivery-number-format/board-static-3840x2160.png`
- `artifacts/delivery-number-format/board-fp-nohash-1920x1080.png`
- `artifacts/delivery-number-format/board-fp-nohash-3840x2160.png`

---

## PR 摘要（文件）

- **What**：外送／迷點號碼格式對齊雲端草案之看板端提案與排版截圖。  
- **Why**：第二道四碼檢查會丟外送與迷點單。  
- **How to test**：閱讀本檔 + 開上述 PNG 比對 #6406／6406 兩方案。
