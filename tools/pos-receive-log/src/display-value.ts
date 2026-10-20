export function displayText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return value;
}

export function displayCount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return String(value);
}
