import { execSync } from 'node:child_process';
import { startCloud, waitCloudReady, startSite, PORT_SITE, PORT_CLOUD } from './harness.mjs';

export default async function globalSetup() {
  try {
    execSync(`fuser -k ${PORT_SITE}/tcp ${PORT_CLOUD}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
    execSync('pkill -f "fake-cloud/server.mjs" 2>/dev/null || true', { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 300));
  startCloud();
  await waitCloudReady();
  await startSite();
}
