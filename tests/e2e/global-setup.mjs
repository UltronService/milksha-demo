import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startCloud, waitCloudReady, startSite, PORT_SITE, PORT_CLOUD, ROOT } from './harness.mjs';

const BASELINE_WORKTREE = '/tmp/wt-6975672';

function ensure6975672Worktree() {
  if (existsSync(join(BASELINE_WORKTREE, 'receiver-demo', 'index.html'))) {
    return;
  }
  try {
    execSync(`git worktree add ${BASELINE_WORKTREE} 6975672`, {
      cwd: ROOT,
      stdio: 'ignore',
    });
  } catch {
    /* shallow CI clones may need the commit present; tests skip baseline if missing */
  }
}

export default async function globalSetup() {
  try {
    execSync(`fuser -k ${PORT_SITE}/tcp ${PORT_CLOUD}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
    execSync('pkill -f "fake-cloud/server.mjs" 2>/dev/null || true', { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 300));
  ensure6975672Worktree();
  startCloud();
  await waitCloudReady();
  await startSite();
}
