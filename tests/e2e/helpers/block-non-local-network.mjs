/**
 * Abort any request not targeting the local e2e site or fake-cloud (no live cloud probes).
 * @param {import('@playwright/test').Page} page
 * @param {{ sitePort: number, cloudPort: number }} ports
 */
export async function blockNonLocalNetwork(page, ports) {
  const siteHost = `127.0.0.1:${ports.sitePort}`;
  const cloudHost = `127.0.0.1:${ports.cloudPort}`;
  const allowHosts = new Set([siteHost, cloudHost, 'localhost:' + ports.sitePort]);

  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    let host = '';
    try {
      host = new URL(url).host;
    } catch {
      await route.abort('blocked');
      return;
    }
    const allowed =
      allowHosts.has(host) ||
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === 'www.gstatic.com' ||
      host.endsWith('.gstatic.com') ||
      host === 'fonts.googleapis.com' ||
      host === 'fonts.gstatic.com' ||
      url.startsWith('data:') ||
      url.startsWith('blob:');
    if (!allowed) {
      await route.abort('blocked');
      return;
    }
    await route.continue();
  });
}
