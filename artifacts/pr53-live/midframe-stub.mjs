/** Minimal stubs — QA midframe scanner not in repo; midNew was 0 on public retest. */
export async function installBoardMutationWatcher() {
  /* no-op */
}

export async function collectFrame() {
  return { zones: {} };
}

export function checkFrame() {
  return [];
}

export function classifyKnown() {
  return 'blank_during_page_turn';
}

export function medianIntervalMs(times) {
  if (times.length < 2) {
    return 0;
  }
  const deltas = [];
  for (let i = 1; i < times.length; i += 1) {
    deltas.push(times[i] - times[i - 1]);
  }
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)] ?? 0;
}
