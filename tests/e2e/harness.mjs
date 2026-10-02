import { spawn, execSync } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execPath } from 'node:process';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PORT_SITE = 8877;
export const PORT_CLOUD = 8787;

let cloudProc;
let siteServer;

export function startCloud() {
  if (cloudProc && cloudProc.exitCode === null) {
    return;
  }
  try {
    execSync('pkill -f "fake-cloud/server.mjs" 2>/dev/null || true', { stdio: 'ignore' });
    execSync(`fuser -k ${PORT_CLOUD}/tcp 2>/dev/null || true`, { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  cloudProc = spawn(execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT_CLOUD) },
    stdio: 'ignore',
  });
}

export async function resetCloudState() {
  try {
    await fetch(`http://127.0.0.1:${PORT_CLOUD}/test/reset`, { method: 'POST' });
  } catch {
    /* ignore */
  }
}

export async function waitCloudReady() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('fake-cloud not ready');
}

export function startSite() {
  if (siteServer) {
    return Promise.resolve();
  }
  siteServer = createServer((req, res) => {
    const urlPath = req.url?.split('?')[0] || '/';
    if (urlPath.startsWith('/__emulator')) {
      const targetPath = urlPath.replace('/__emulator', '') || '/';
      const proxy = httpRequest(
        {
          hostname: '127.0.0.1',
          port: PORT_CLOUD,
          path: targetPath + (req.url?.includes('?') ? '?' + req.url.split('?')[1] : ''),
          method: req.method,
          headers: req.headers,
        },
        (pres) => {
          res.writeHead(pres.statusCode || 502, pres.headers);
          pres.pipe(res);
        },
      );
      proxy.on('error', () => {
        res.writeHead(502);
        res.end('proxy error');
      });
      req.pipe(proxy);
      return;
    }
    try {
      let p = urlPath;
      if (p === '/') p = '/index.html';
      if (p.endsWith('/')) p += 'index.html';
      const file = join(ROOT, decodeURIComponent(p.replace(/^\//, '')));
      const data = readFileSync(file);
      const ext = file.split('.').pop();
      const types = {
        html: 'text/html',
        js: 'text/javascript',
        css: 'text/css',
        svg: 'image/svg+xml',
        json: 'application/json',
      };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((r) => siteServer.listen(PORT_SITE, '127.0.0.1', r));
}

export function stopHarness() {
  if (siteServer) siteServer.close();
  if (cloudProc) cloudProc.kill();
}

export function urlsForMode(mode) {
  const base = `http://127.0.0.1:${PORT_SITE}`;
  const gw = `127.0.0.1:${PORT_SITE}`;
  const emu = mode === 'firestore' ? '&emulatorPrefix=__emulator' : '';
  const recv =
    `${base}/receiver-demo/?mode=${mode}&store=s120030&device=stb-01&code=dev-controller-access-2026` +
    (mode === 'firestore' ? `&gateway=${gw}${emu}` : '');
  const ctrl =
    `${base}/controller/?mode=${mode}` + (mode === 'firestore' ? `&gateway=${gw}${emu}` : '');
  return { recv, ctrl, base };
}

export async function freshContext(browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__e2e_init')) {
        localStorage.clear();
        sessionStorage.setItem('__e2e_init', '1');
      }
    } catch {
      /* ignore */
    }
  });
  return ctx;
}

export async function connectController(page, mode) {
  if (mode === 'firestore') {
    await page.selectOption('#fld-mode', 'firestore');
    // 進階設定 is collapsed by default; set fields via script (URL params also feed buildConfig).
    await page.evaluate(
      ({ host, key }) => {
        const adv = document.getElementById('advanced-settings');
        if (adv) adv.open = true;
        const g = document.getElementById('fld-gateway');
        const k = document.getElementById('fld-key');
        if (g && !g.value.trim()) g.value = host;
        if (k && !k.value.trim()) k.value = key;
      },
      { host: `127.0.0.1:${PORT_SITE}`, key: 'fake-api-key-for-emulator' },
    );
  } else {
    await page.selectOption('#fld-mode', 'local');
  }
  await page.click('#btn-connect');
  await page.waitForSelector('#online-state[data-connected="1"]', { timeout: 15000 });
  if (mode === 'firestore') {
    try {
      await page.waitForFunction(
        () => {
          const el = document.getElementById('status-heartbeat-at');
          return el && el.textContent && el.textContent !== '—';
        },
        { timeout: 20000 },
      );
    } catch {
      await page.waitForTimeout(4000);
    }
    await page.waitForTimeout(800);
  } else {
    await page.waitForTimeout(400);
  }
}
