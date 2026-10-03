import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './harness.mjs';

export const BASELINE_WORKTREE = '/tmp/wt-6975672';

/** Measured @ 6975672, 1920×1080, 8888 (border-box width; clientHeight padding box). */
export const RING_BASELINE_6975672 = {
  boxWidth: 848.640625,
  boxHeight: 456,
  paddingLeft: 80,
  paddingRight: 80,
  borderLeft: 8,
  borderRight: 8,
  fontSize: 280,
  letterSpacingPx: 8,
};

export function ensure6975672Worktree() {
  if (existsSync(join(BASELINE_WORKTREE, 'receiver-demo', 'index.html'))) {
    return;
  }
  try {
    execSync('git fetch --depth=1 origin 6975672', { cwd: ROOT, stdio: 'ignore' });
  } catch {
    /* best-effort */
  }
  execSync(`git worktree add ${BASELINE_WORKTREE} 6975672`, {
    cwd: ROOT,
    stdio: 'ignore',
  });
}
