import { describe, expect, it } from 'vitest';
import { displayCount, displayText } from '../src/display-value';

describe('display-value', () => {
  it('shows em dash for empty text', () => {
    expect(displayText(null)).toBe('—');
    expect(displayText(undefined)).toBe('—');
    expect(displayText('')).toBe('—');
  });

  it('shows real zero count as 0', () => {
    expect(displayCount(0)).toBe('0');
  });

  it('shows em dash for null count but not for zero', () => {
    expect(displayCount(null)).toBe('—');
    expect(displayCount(undefined)).toBe('—');
    expect(displayCount(3)).toBe('3');
  });
});
