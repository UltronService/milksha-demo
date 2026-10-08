import { PORT_CLOUD, PORT_SITE, isolatedCloudContext } from './harness.mjs';

const STORE = 'zz-qa-store-a';
const DEVICE = 'stb-01';

export function boardUrl(extraQuery) {
  const q = new URLSearchParams({
    mode: 'firestore',
    store: STORE,
    device: DEVICE,
    gateway: `127.0.0.1:${PORT_CLOUD}`,
    key: 'fake-api-key-for-emulator',
    project: 'milksha-qms-dev',
  });
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) {
      q.set(k, v);
    }
  }
  return `http://127.0.0.1:${PORT_SITE}/?${q.toString()}`;
}

export async function installEmulatorFunctionShim(target) {
  const base = `http://127.0.0.1:${PORT_CLOUD}`;
  await target.route('https://asia-east1-milksha-qms-dev.cloudfunctions.net/**', async (route) => {
    const u = new URL(route.request().url());
    const res = await fetch(`${base}/fn/milksha-qms-dev/asia-east1/${u.pathname.replace(/^\//, '')}${u.search}`, {
      method: route.request().method(),
      headers: route.request().headers(),
      body: route.request().postDataBuffer(),
    });
    const body = Buffer.from(await res.arrayBuffer());
    const headers = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    await route.fulfill({ status: res.status, headers, body });
  });
}

export async function openRealtimeBoard(browser, queryExtra) {
  const ctx = await isolatedCloudContext(browser);
  await installEmulatorFunctionShim(ctx);
  const page = await ctx.newPage();
  await page.goto(boardUrl(queryExtra));
  await page.waitForFunction(() => window.receiverCloud && window.receiverCloud.getRealtimeStats, {
    timeout: 45000,
  });
  return { ctx, page };
}

export { STORE, DEVICE };
