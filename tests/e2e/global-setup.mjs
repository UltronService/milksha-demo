import { startCloud, waitCloudReady, startSite } from './harness.mjs';
import { ensure6975672Worktree } from './baseline-6975672.mjs';

export default async function globalSetup() {
  ensure6975672Worktree();
  startCloud();
  await waitCloudReady();
  await startSite();
}
