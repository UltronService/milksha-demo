# POS time sort — mutation checks (required)

Run from repo root; always `git checkout` affected files after each mutation.

## §11 — local receive time (`item.firstSeenAt` / `item.readyAt`)

**Product “local received time”** is not a separate sort API argument. `applyPayload` stamps `firstSeenAt` / `readyAt` from `Date.now()` on each row; `resolvePreparingSortMs` / `resolveReadySortMs` read those fields after POS ms and `updatedAt`. A former `localReceiveMs` function parameter was always passed `0` from `compareBoardZoneItems` and was removed as unreachable dead code (2026-10-20).

**Mutate:** Remove `resolvePreparingSortMs` use of `item.firstSeenAt` in `js/board/board-item-sort.js`.

```bash
node -e "
const fs=require('fs');
let s=fs.readFileSync('js/board/board-item-sort.js','utf8');
s=s.replace(/    const local = parseMs\\(item && item\\.firstSeenAt\\);\\n    if \\(local != null\\) \\{\\n      return local;\\n    \\}\\n/,'');
fs.writeFileSync('js/board/board-item-sort.js',s);
"
node --test tests/milksha-board-pos-time-sort.test.js --test-name-pattern '11 missing POS'
git checkout js/board/board-item-sort.js
```

| State | Test 11 |
|-------|---------|
| Mutated | **FAIL** — order `['8101','8102']` (payload index only) |
| Restored | **PASS** — order `['8102','8101']` |

Payload at `T2` is `[8102, 8101]` so index tie-break alone puts `8101` first.

---

## §12 — mixed POS / updatedAt / local receive sort order

**Test asserts exact order:** `['8202', '8203', '8201']` (local receive ms → `updatedAt` → `firstSeenPosAtMs`).

**Mutate:** Reverse primary time comparator in `js/board/board-item-sort.js` (`tb - ta` → `ta - tb`).

```bash
node -e "
const fs=require('fs');
let s=fs.readFileSync('js/board/board-item-sort.js','utf8');
s=s.replace('return tb - ta;','return ta - tb;');
fs.writeFileSync('js/board/board-item-sort.js',s);
"
node --test tests/milksha-board-pos-time-sort.test.js --test-name-pattern '12 mixed with'
git checkout js/board/board-item-sort.js
```

| State | Test 12 |
|-------|---------|
| Mutated | **FAIL** — order becomes `['8201','8203','8202']` (oldest-first) |
| Restored | **PASS** — `['8202','8203','8201']` |

---

## §20a — `motion=on` must use animator (required)

**Mutate:** Force `isBoardMotionOn()` to return `false` in `js/milksha-board.js` (ignore `?motion=on`).

```bash
sed -i "s/return new URLSearchParams(win.location.search).get('motion') === 'on';/return false;/" js/milksha-board.js
node --test tests/milksha-board-pos-time-sort.test.js --test-name-pattern '20 motion=on'
git checkout js/milksha-board.js
```

| State | Test 20 (first assertion) |
|-------|---------------------------|
| Mutated | **FAIL** — `getAnimSkipReason()` is `motion-off`, expected `animate` |
| Restored | **PASS** |

---

## §20b — no static motion HTML defects (required)

**Mutate:** Inject float-layer class on chips (simulates broken static/motion DOM).

```bash
sed -i 's/milksha-board-chip--with-slot/milksha-board-chip--layer-float milksha-board-chip--with-slot/' js/milksha-board.js
node --test tests/milksha-board-pos-time-sort.test.js --test-name-pattern '20 motion=on'
git checkout js/milksha-board.js
```

| State | Test 20 (violations assertion) |
|-------|--------------------------------|
| Mutated | **FAIL** — `staticMotionViolations` includes `float-layer` |
| Restored | **PASS** |

---

## §23 — `posTimeSource` round-trip (required)

**Mutate:** Remove `posTimeSource` from `BOARD_POS_TIME_FIELD` in `js/board/board-pos-time-fields.js`.

```bash
node -e "
const fs=require('fs');
const p='js/board/board-pos-time-fields.js';
let s=fs.readFileSync(p,'utf8');
s=s.replace(\"    posTimeSource: 'posTimeSource',\\n\",'');
fs.writeFileSync(p,s);
"
node --test tests/milksha-board-pos-time-sort.test.js --test-name-pattern 'posTimeSource round-trips'
git checkout js/board/board-pos-time-fields.js
```

| State | Test 23 |
|-------|---------|
| Mutated | **FAIL** — `nc[0].posTimeSource` / snapshot fields `undefined` |
| Restored | **PASS** — `server` / `pos` on prep and ready |
