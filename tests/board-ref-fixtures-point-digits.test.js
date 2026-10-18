import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REF_BOARD_NUMBERS_PREP, buildRefBoardPayload } from './e2e/board-ref-fixtures.mjs';

test('ref prep numbers use 3-digit point format', function () {
  for (const n of REF_BOARD_NUMBERS_PREP) {
    assert.match(n, /^\d{3}$/);
  }
  const prepRows = buildRefBoardPayload().filter((r) => r.source_type.includes('Preparing'));
  assert.equal(prepRows.length, REF_BOARD_NUMBERS_PREP.length);
});
