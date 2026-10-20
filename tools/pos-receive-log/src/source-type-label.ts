import type { SourceType } from './types';

const LABELS: Record<SourceType, string> = {
  store: '門市',
  uber_eats: 'Uber Eats',
  foodpanda: 'foodpanda',
  milksha_points: '迷點',
};

export function sourceTypeLabel(sourceType: SourceType): string {
  return LABELS[sourceType];
}
