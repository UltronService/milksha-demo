import { chromium } from 'playwright';

const BOARD = 'https://ultronservice.github.io/milksha-demo/';
const CTRL = 'https://ultronservice.github.io/milksha-demo/controller/';

/** @param {import('playwright').BrowserContext} ctx */
async function probeBoard(page, label) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  await page.goto(BOARD, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k) {
        keys.push({ key: k, len: (localStorage.getItem(k) || '').length });
      }
    }
    const devKey = 'milksha:local:device:s120030:stb-01';
    let devDoc = null;
    try {
      devDoc = JSON.parse(localStorage.getItem(devKey) || 'null');
    } catch {
      devDoc = 'parse-error';
    }
    return {
      href: location.href,
      hasQms: Boolean(window.QMS),
      hasRuntime: Boolean(window.QMS && window.QMS.runtime),
      hasReceiverCloud: Boolean(window.receiverCloud),
      hasTransport: Boolean(window.QMS && window.QMS.Transport),
      hasReceiverBoot: Boolean(window.QMS && window.QMS.Receiver && window.QMS.Receiver.bootReceiverCloud),
      localStorageKeys: keys,
      deviceDoc: devDoc,
      boardRoot: Boolean(document.getElementById('board-root')),
    };
  });
  return { label, errors, state };
}

async function runScenario(name, seedFn) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  if (seedFn) {
    await ctx.addInitScript(seedFn);
  }
  const board = await ctx.newPage();
  const boardProbe = await probeBoard(board, name + ' board');
  const controller = await ctx.newPage();
  await controller.goto(CTRL, { waitUntil: 'networkidle', timeout: 60000 });
  await controller.waitForTimeout(5000);
  const ctrlState = await controller.evaluate(() => {
    const el = document.getElementById('online-state');
    return {
      onlineText: el ? el.textContent : '',
      connected: el ? el.getAttribute('data-connected') : '',
      store: document.getElementById('fld-store')?.value,
      device: document.getElementById('fld-device')?.value,
      mode: document.getElementById('fld-mode')?.value,
    };
  });
  await controller.click('[data-testid="btn-send-numbers"]');
  await board.waitForTimeout(2500);
  const numbers = await board.evaluate(() => {
    const nums = [];
    document.querySelectorAll('.milksha-num').forEach((n) => nums.push(n.textContent));
    return nums;
  });
  await ctx.close();
  await browser.close();
  return { name, boardProbe, ctrlState, numbers };
}

const fresh = await runScenario('fresh-profile', null);

const staleSeed = () => {
  localStorage.setItem('milksha:deviceId', 'stb-old-99');
  localStorage.setItem(
    'milksha:cloud-settings',
    JSON.stringify({
      projectId: 'milksha-qms-dev',
      apiKey: 'old-key',
      accessCode: 'old-code',
      region: 'asia-east1',
    }),
  );
  localStorage.setItem('milksha:local:device:s120030:stb-old-99', JSON.stringify({ online: true, lastSeen: new Date().toISOString() }));
  localStorage.setItem(
    'milksha:local:device:s110012:stb-01',
    JSON.stringify({ online: true, lastSeen: new Date().toISOString(), boardSeq: 1 }),
  );
};

const stale = await runScenario('stale-profile', staleSeed);

console.log(JSON.stringify({ fresh, stale }, null, 2));
