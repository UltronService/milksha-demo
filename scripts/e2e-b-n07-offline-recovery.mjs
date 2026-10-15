/**
 * B-N07 live repro: block Firebase ~60s on milksha cloud board, measure recovery.
 * Requires env K (Firebase web API key).
 */
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';

const projectId = 'milksha-qms-dev';
const storeId = 'c030020';
const deviceId = 'stb-01';
const apiKey = process.env.K;
const base = `https://asia-east1-${projectId}.cloudfunctions.net`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tsFmt = (n = Date.now()) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
      .formatToParts(n)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}-${p.hour}-${p.minute}-${p.second}:${String(n % 1000).padStart(4, '0')}`;
};
const post = async (p, b, t) => {
  const h = { 'Content-Type': 'application/json' };
  if (t) {
    h.Authorization = `Bearer ${t}`;
  }
  const r = await fetch(`${base}/${p}`, { method: 'POST', headers: h, body: JSON.stringify(b) });
  const x = await r.text();
  try {
    return JSON.parse(x);
  } catch {
    return x;
  }
};
const tok = async (role, dev) => {
  const l = await post('devLogin', { storeId, role, deviceId: dev });
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: l.customToken, returnSecureToken: true }),
    },
  );
  return (await r.json()).idToken;
};

if (!apiKey) {
  console.error('Missing env K (Firebase API key)');
  process.exit(1);
}

const ctl = await tok('controller', 'qa-1016e');
const dv = await tok('device', deviceId);
const hb = () =>
  post('boxHeartbeat', { appVersion: 'qa', pendingUploads: 0, boardSeq: 0, simulatedOffline: false }, dv);
await hb();
const iv = setInterval(() => hb().catch(() => {}), 30000);
const P = (n, s) => ({ number: n, source_type: s });
const B = (nums, o = {}) => ({
  isEncrypt: false,
  serviceSpecialData_Json: {
    target: `milksha${storeId}`,
    data: {
      number_content: nums,
      ...(o.ticker ? { newsTicker_content: o.ticker, newsTickerSpeed: o.speed ?? 8 } : {}),
    },
  },
  merchant_id: 'Milksha',
  account: storeId,
  timeStmp: tsFmt(),
});
const send = (b) => post('posReceiver', b);
const clear = () => post('devCommand', { storeId, deviceId, type: 'clear_now' }, ctl);
const URL = 'https://ultronservice.github.io/milksha-demo/?mode=cloud&store=c030020';
const RUNS = Number(process.env.B_N07_RUNS || 5);
const results = [];

const br = await chromium.launch();
try {
  await mkdir('shots', { recursive: true });
  await clear();
  for (let run = 1; run <= RUNS; run += 1) {
    const c = await br.newContext({ viewport: { width: 1920, height: 1080 } });
    const p = await c.newPage();
    await p.goto(URL);
    await p.waitForTimeout(5000);
    const shown = () =>
      p.evaluate(() =>
        [...document.querySelectorAll('.milksha-zone')]
          .map((z) =>
            [...z.querySelectorAll('.milksha-num-cell')].map((cell) => cell.innerText.trim()).filter(Boolean),
          )
          .flat(),
      );
    await clear();
    await sleep(3000);
    await c.setOffline(true);
    await send(B([P(String(2600 + run), 'From_Store_OK')]));
    await sleep(5000);
    await c.setOffline(false);
    await sleep(8000);
    const blockPattern = /googleapis\.com|cloudfunctions\.net|run\.app/;
    await p.route(blockPattern, (r) => r.abort());
    const targetNo = String(2700 + run);
    await send(B([P(targetNo, 'From_Store_OK')]));
    await sleep(60000);
    await p.unroute(blockPattern);
    const t2 = Date.now();
    let numberMs = null;
    let bannerClearMs = null;
    while (Date.now() - t2 < 120000) {
      const f = await shown();
      if (numberMs == null && f.length === 1 && f[0].includes(targetNo)) {
        numberMs = Date.now() - t2;
      }
      const off = await p.evaluate(() => document.getElementById('milksha-cloud-offline').hidden);
      if (bannerClearMs == null && off) {
        bannerClearMs = Date.now() - t2;
      }
      if (numberMs != null && bannerClearMs != null) {
        break;
      }
      await p.waitForTimeout(250);
    }
    const ms = numberMs != null ? numberMs : Date.now() - t2;
    const off = await p.evaluate(() => ({
      off: !document.getElementById('milksha-cloud-offline').hidden,
      paused: !document.getElementById('milksha-cloud-paused').hidden,
    }));
    await p.screenshot({ path: `shots/B-N07-run-${run}.png` });
    const pass = numberMs != null && numberMs <= 30000 && bannerClearMs != null && bannerClearMs <= 8000;
    results.push({ run, pass, numberMs: ms, bannerClearMs, banner: off });
    console.log(`run ${run}`, pass ? 'PASS' : 'FAIL', JSON.stringify({ numberMs: ms, bannerClearMs, banner: off }));
    await c.close();
  }
} finally {
  clearInterval(iv);
  await clear();
  await br.close();
  await writeFile('e2e-results.json', JSON.stringify({ B-N07: results }, null, 2));
}
