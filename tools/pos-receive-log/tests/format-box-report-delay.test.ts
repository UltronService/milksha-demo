import { describe, expect, it } from 'vitest';
import {
  formatDelaySecondsCell,
  formatDelaySecondsDisplay,
} from '../src/format-box-report-delay';

describe('format-box-report-delay (PR #48 delay in seconds)', () => {
  it('formats seconds with 3 decimals', () => {
    expect(formatDelaySecondsDisplay(1.5)).toBe('1.500');
    expect(formatDelaySecondsCell(1.5)).toBe('1.500');
  });

  it('appends 兩邊時鐘不同 when delay is negative', () => {
    expect(formatDelaySecondsCell(-0.12)).toBe('-0.120 兩邊時鐘不同');
  });
});
