# Test 11 mutation check (local `firstSeenAt` sort fallback)

**Procedure:** Remove `resolvePreparingSortMs` use of `item.firstSeenAt` in `js/board/board-item-sort.js` (lines that return `parseMs(item.firstSeenAt)`).

**Command:**
```bash
# patch out firstSeenAt branch, then:
node --test tests/milksha-board-pos-time-sort.test.js --test-name-pattern '^11 '
git checkout js/board/board-item-sort.js
```

**Result (2026-10-20):**
- Mutated: `not ok 11 - 11 missing POS and updatedAt uses local receive time` (order becomes `8101` before `8102` when payload lists 8102 first).
- Restored: `ok 11`.

Test 11 now uses payload order `[8102, 8101]` at `T2` so payload-index tie-break alone would sort `8101` first; only local receive times force `8102` first.
