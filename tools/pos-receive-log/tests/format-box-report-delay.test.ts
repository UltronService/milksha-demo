import { describe, expect, it } from 'vitest';
import {
  formatReceiveDelayCell,
  formatReceiveDelaySecondsFromMs,
} from '../src/format-box-report-delay';

describe('format-box-report-delay (#112 group 5)', () => {
  it('converts delayMs to seconds with 3 decimals', () => {
    expect(formatReceiveDelaySecondsFromMs(1500)).toBe('1.500');
    expect(formatReceiveDelayCell(1500)).toBe('1.500');
  });

  it('appends 兩邊時鐘不同 when delay is negative', () => {
    expect(formatReceiveDelayCell(-120)).toBe('-0.120 兩邊時鐘不同');
  });
});
