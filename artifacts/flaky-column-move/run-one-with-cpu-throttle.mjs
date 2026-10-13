import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const rate = Number(process.argv[2] ?? 4);
const port = process.env.MILKSHA_E2E_PORT || '8877';

const server = spawn('node', ['tests/e2e/web-server.mjs'], {
  cwd: new URL('../../', import.meta.url).pathname,
  env: { ...process.env, MILKSHA_E2E_PORT: port, FAKE_CLOUD_HTTP_DATE: 'Sat, 03 Oct 2026 12:00:00 GMT' },
  stdio: 'ignore',
});

await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('web server timeout')), 120_000);
  const poll = setInterval(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/controller/`);
      if (r.ok) {
        clearInterval(poll);
        clearTimeout(t);
        resolve(undefined);
      }
    } catch {
      /* wait */
    }
  }, 200);
});

let exitCode = 1;
try {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });

  const child = spawn(
    'npx',
    ['playwright', 'test', 'tests/e2e/board-column-move.spec.mjs', '-g', '5 ready:', '--reporter=line'],
    {
      cwd: new URL('../../', import.meta.url).pathname,
      env: {
        ...process.env,
        FONTCONFIG_FILE: new URL('../../tests/e2e/fonts/fontconfig-e2e.conf', import.meta.url).pathname,
        MILKSHA_E2E_PORT: port,
        PW_TEST_CONNECT_WS_ENDPOINT: '',
      },
      stdio: 'inherit',
    },
  );
  exitCode = await new Promise((res) => child.on('close', res));
  await browser.close();
} finally {
  server.kill('SIGTERM');
}
process.exit(exitCode ?? 1);
