import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execPath } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const PORT_SITE = 8877;
const PORT_CLOUD = 8787;

let cloudProc;
let siteServer;

function startCloud() {
  cloudProc = spawn(execPath, [join(ROOT, 'tools', 'fake-cloud', 'server.mjs')], {
    env: { ...process.env, FAKE_CLOUD_PORT: String(PORT_CLOUD) },
    stdio: 'ignore',
  });
}

async function waitCloudReady() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT_CLOUD}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('fake-cloud not ready');
}

function startSite() {
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
      const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((r) => siteServer.listen(PORT_SITE, '127.0.0.1', r));
}

test.beforeAll(async () => {
  startCloud();
  await waitCloudReady();
  await startSite();
});

test.afterAll(async () => {
  if (siteServer) siteServer.close();
  if (cloudProc) cloudProc.kill();
});

test('firestore mode controller → receiver board', async ({ browser }) => {
  const gw = `127.0.0.1:${PORT_SITE}`;
  const emu = '&emulatorPrefix=__emulator';
  const recvUrl =
    `http://127.0.0.1:${PORT_SITE}/receiver-demo/?mode=firestore&gateway=${gw}${emu}&store=s120030&device=stb-01&code=dev`;
  const ctrlUrl = `http://127.0.0.1:${PORT_SITE}/controller/?gateway=${gw}${emu}`;

  const ctx = await browser.newContext();
  const receiver = await ctx.newPage();
  const controller = await ctx.newPage();
  controller.on('pageerror', (err) => {
    console.error('controller pageerror:', err.message);
  });

  await receiver.goto(recvUrl);
  await controller.goto(ctrlUrl);

  await controller.selectOption('#fld-mode', 'firestore');
  await controller.fill('#fld-gateway', gw);
  await controller.fill('#fld-key', 'fake-api-key-for-emulator');
  await controller.fill('#fld-gateway', gw);
  await controller.click('#btn-connect');
  await expect(controller.locator('#online-state')).toContainText('已連線', { timeout: 8000 });
  await controller.selectOption('#fld-status', 'preparing');
  await new Promise((r) => setTimeout(r, 2500));
  await controller.click('#btn-add-ticket');

  await expect(receiver.locator('.rcv-prep .rcv-num').first()).toHaveText('2001', {
    timeout: 15000,
  });
});
