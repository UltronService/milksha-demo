import { describe, expect, it } from 'vitest';
import { entryTypeLabel } from '../src/entry-type-label';

describe('entryTypeLabel (入口 column display)', () => {
  it('shows POS for POS entry', () => {
    expect(entryTypeLabel('POS')).toBe('POS');
  });

  it('shows 控制端 for controller entry', () => {
    expect(entryTypeLabel('controller')).toBe('控制端');
  });

  it('shows 未知 for unknown entry', () => {
    expect(entryTypeLabel('unknown')).toBe('未知');
  });
});
