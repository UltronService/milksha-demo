/**
 * Long-lived static site + fake-cloud for Playwright (survives worker restarts).
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.MILKSHA_SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

import { startCloud, waitCloudReady, startSite, PORT_SITE } from './harness.mjs';

startCloud();
await waitCloudReady();
await startSite();

const probe = await fetch(`http://127.0.0.1:${PORT_SITE}/controller/`).catch(() => null);
if (!probe?.ok) {
  console.error('e2e web-server: site not reachable on port', PORT_SITE);
  process.exit(1);
}

// Keep process alive for Playwright webServer.
setInterval(() => {}, 60_000);
