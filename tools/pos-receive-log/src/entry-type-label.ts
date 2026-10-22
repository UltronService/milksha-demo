import type { EntryType } from './types';

export function entryTypeLabel(entry: EntryType): string {
  switch (entry) {
    case 'POS':
      return 'POS';
    case 'controller':
      return '控制端';
    case 'unknown':
      return '未知';
    default: {
      const _exhaustive: never = entry;
      return _exhaustive;
    }
  }
}
