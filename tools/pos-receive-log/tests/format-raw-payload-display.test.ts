import { describe, expect, it } from 'vitest';
import {
  formatRawPayloadForDisplay,
  POS_RAW_MESSAGE_MAX_HEIGHT_PX,
} from '../src/format-raw-payload-display';

describe('formatRawPayloadForDisplay', () => {
  it('TDD-11: pretty-prints valid JSON', () => {
    const out = formatRawPayloadForDisplay('{"a":1,"b":[2]}');
    expect(out).toContain('"a": 1');
    expect(out).toContain('\n');
  });

  it('TDD-12: returns broken JSON unchanged', () => {
    const broken = '{"a":';
    expect(formatRawPayloadForDisplay(broken)).toBe(broken);
  });

  it('TDD-10: leaves non-JSON plain text unchanged', () => {
    const plain = 'plain-text\nline2';
    expect(formatRawPayloadForDisplay(plain)).toBe(plain);
  });

  it('TDD-8: max height constant is 320px', () => {
    expect(POS_RAW_MESSAGE_MAX_HEIGHT_PX).toBe(320);
  });
});
