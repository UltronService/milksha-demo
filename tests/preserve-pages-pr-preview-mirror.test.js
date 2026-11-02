import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import {
  collectRelativeAssetPathsFromHtml,
  hasMisplacedNestedPreviewTree,
  mirrorPreviewTree,
  stripQueryStringFromSavedFilenames,
  verifyPreviewFolderIntegrity,
  wgetCutDirsForPreviewUrl,
} from '../scripts/lib/pages-pr-preview-mirror.mjs';
import { verifyStrictPreviewFolders } from '../scripts/lib/pages-pr-preview-preserve.mjs';

const REPO_SEGMENT = 'milksha-demo';
const PR_NUM = '4242';

function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

function startFakePagesServer() {
  const siteRoot = mkdtempSync(join(tmpdir(), 'fake-pages-'));
  const previewRoot = join(siteRoot, REPO_SEGMENT, 'pr-preview', `pr-${PR_NUM}`);
  mkdirSync(join(previewRoot, 'js'), { recursive: true });
  mkdirSync(join(previewRoot, 'css'), { recursive: true });
  writeFileSync(join(previewRoot, 'js', 'app.js'), 'export const ok = true;\n', 'utf8');
  writeFileSync(join(previewRoot, 'css', 'app.css'), 'body{margin:0}\n', 'utf8');
  writeFileSync(
    join(previewRoot, 'index.html'),
    [
      '<!doctype html><html><head>',
      '<link rel="stylesheet" href="css/app.css?v=20261026a">',
      '</head><body>',
      '<script type="module" src="js/app.js?v=20261026a"></script>',
      '</body></html>',
    ].join(''),
    'utf8',
  );

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  return reserveLocalPort().then(async (port) => {
    const proc = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
      cwd: siteRoot,
      stdio: 'ignore',
      detached: false,
    });
    const rootUrl = `http://127.0.0.1:${port}/${REPO_SEGMENT}`;
    const readyUrl = `${rootUrl}/pr-preview/pr-${PR_NUM}/index.html`;
    for (let i = 0; i < 30; i += 1) {
      const probe = spawnSync('curl', ['-fsS', '-o', '/dev/null', readyUrl], { encoding: 'utf8' });
      if (probe.status === 0) {
        break;
      }
      await sleep(50);
    }
    return {
      rootUrl,
      siteRoot,
      stop: () => {
        proc.kill('SIGTERM');
        rmSync(siteRoot, { recursive: true, force: true });
      },
    };
  });
}

test('wgetCutDirsForPreviewUrl counts repo/pr-preview/pr-N path segments', function () {
  assert.equal(
    wgetCutDirsForPreviewUrl('https://example.github.io/milksha-demo', '124'),
    3,
  );
});

test('collectRelativeAssetPathsFromHtml strips ?v= query from href/src', function () {
  const html =
    '<link href="css/app.css?v=1"><script src="js/app.js?v=2"></script>';
  assert.deepEqual(collectRelativeAssetPathsFromHtml(html), ['css/app.css', 'js/app.js']);
});

test('mirrorPreviewTree flattens assets to destDir (same wget flags as CI)', async function () {
  const server = await startFakePagesServer();
  const deployRoot = mkdtempSync(join(tmpdir(), 'deploy-site-'));
  const destDir = join(deployRoot, 'pr-preview', `pr-${PR_NUM}`);
  try {
    mirrorPreviewTree(destDir, server.rootUrl, PR_NUM);

    assert.ok(existsSync(join(destDir, 'index.html')), 'index.html at dest root');
    assert.equal(
      hasMisplacedNestedPreviewTree(destDir, server.rootUrl),
      false,
      'must not keep destDir/milksha-demo/pr-preview/...',
    );
    assert.ok(existsSync(join(destDir, 'js', 'app.js')), 'js at dest root');
    assert.ok(existsSync(join(destDir, 'css', 'app.css')), 'css at dest root');

    const integrity = verifyPreviewFolderIntegrity(destDir, server.rootUrl);
    assert.equal(
      integrity.ok,
      true,
      `integrity: missing=${integrity.missing.join(',')} misplaced=${integrity.misplacedNested}`,
    );

    const jsEntries = readdirSync(join(destDir, 'js'));
    assert.ok(
      jsEntries.includes('app.js'),
      `expected app.js on disk, got: ${jsEntries.join(', ')}`,
    );
    assert.ok(
      !jsEntries.some((name) => name.includes('?')),
      'wget must not leave query suffix in filenames',
    );
  } finally {
    server.stop();
    rmSync(deployRoot, { recursive: true, force: true });
  }
});

test('stripQueryStringFromSavedFilenames renames app.js?v=tag to app.js', function () {
  const dir = mkdtempSync(join(tmpdir(), 'strip-query-'));
  mkdirSync(join(dir, 'js'), { recursive: true });
  writeFileSync(join(dir, 'js', 'app.js?v=20261026a'), 'x', 'utf8');
  stripQueryStringFromSavedFilenames(dir);
  assert.ok(existsSync(join(dir, 'js', 'app.js')));
  assert.equal(readdirSync(join(dir, 'js')).includes('app.js?v=20261026a'), false);
  rmSync(dir, { recursive: true, force: true });
});

test('verifyStrictPreviewFolders fails when index references missing js/css', function () {
  const dir = mkdtempSync(join(tmpdir(), 'strict-preview-'));
  const preview = join(dir, 'pr-preview', 'pr-9');
  mkdirSync(preview, { recursive: true });
  writeFileSync(
    join(preview, 'index.html'),
    '<script src="js/missing.js"></script><link href="css/missing.css" rel=stylesheet>',
    'utf8',
  );
  const result = verifyStrictPreviewFolders(dir, 'http://127.0.0.1:9/milksha-demo', ['9']);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('js/missing.js')));
  rmSync(dir, { recursive: true, force: true });
});
