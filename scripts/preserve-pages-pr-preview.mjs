#!/usr/bin/env node
/**
 * Merge live pr-preview/pr-N/ trees into deploy-site before upload-pages-artifact.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mirrorPreviewTree, verifyPreviewFolderIntegrity } from './lib/pages-pr-preview-mirror.mjs';
import {
  MANIFEST_REL_PATH,
  buildDeployedPreviewsManifest,
  evaluatePreserveStep,
  listPrNumbersFromDeploySite,
  mergePreservePrNumbers,
  parseDeployedPreviewsManifest,
  verifyStrictPreviewFolders,
} from './lib/pages-pr-preview-preserve.mjs';

const ROOT_URL = 'https://ultronservice.github.io/milksha-demo';

function usage() {
  console.error('Usage: preserve-pages-pr-preview.mjs <deploy-site> [current-pr-number]');
  process.exit(2);
}

function curlHttpCode(url) {
  const r = spawnSync(
    'curl',
    ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '-L', '--max-time', '30', url],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    return '000';
  }
  return String(r.stdout || '').trim() || '000';
}

function curlBody(url) {
  const r = spawnSync('curl', ['-fsSL', '-L', '--max-time', '60', url], { encoding: 'utf8' });
  if (r.status !== 0) {
    return null;
  }
  return r.stdout;
}

function ghCursorPrNumbers() {
  const r = spawnSync(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      '500',
      '--json',
      'number,headRefName',
      '--jq',
      '.[] | select(.headRefName | startswith("cursor/")) | .number',
    ],
    { encoding: 'utf8', env: process.env },
  );
  if (r.status !== 0) {
    const msg = (r.stderr || r.stdout || 'gh pr list failed').trim();
    throw new Error(msg);
  }
  return (r.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((n) => /^\d+$/.test(n));
}

const deploySite = process.argv[2];
const currentPr = process.argv[3] || '';
const strict = process.env.PAGES_PRESERVE_STRICT === '1';

if (!deploySite) {
  usage();
}

const prPreviewRoot = join(deploySite, 'pr-preview');
mkdirSync(prPreviewRoot, { recursive: true });

const manifestRaw = curlBody(`${ROOT_URL}/${MANIFEST_REL_PATH}`) || '';
const fromManifest = parseDeployedPreviewsManifest(manifestRaw);
let fromGh = [];
try {
  fromGh = ghCursorPrNumbers();
} catch (err) {
  if (strict) {
    console.error(`preserve: gh pr list failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  console.error(`preserve: warning: gh pr list failed, using manifest only`);
}

const prNumbers = mergePreservePrNumbers({
  fromManifest,
  fromGhCursorPrs: fromGh,
  currentPr,
});

if (prNumbers.length === 0 && fromManifest.length === 0 && fromGh.length === 0) {
  console.error('preserve: no PR candidates (manifest empty and gh list empty)');
  if (strict) {
    process.exit(1);
  }
}

let failures = 0;
for (const num of prNumbers) {
  const dest = join(prPreviewRoot, `pr-${num}`);
  const alreadyInArtifact = existsSync(join(dest, 'index.html'));
  const inManifest = fromManifest.includes(num);
  const liveUrl = `${ROOT_URL}/pr-preview/pr-${num}/`;
  const httpCode = alreadyInArtifact ? '200' : curlHttpCode(liveUrl);
  let mirrored = false;
  if (!alreadyInArtifact && httpCode === '200') {
    console.log(`preserve: mirroring live pr-preview/pr-${num}/`);
    mirrored = mirrorPreviewTree(dest, ROOT_URL, num);
  } else if (alreadyInArtifact) {
    console.log(`preserve: pr-${num} already in artifact`);
  }

  const integrity = verifyPreviewFolderIntegrity(dest, ROOT_URL);
  const needsIntegrity =
    strict && (mirrored || alreadyInArtifact || existsSync(join(dest, 'index.html')));

  const verdict = evaluatePreserveStep({
    strict,
    inManifest,
    httpCode,
    mirrored,
    alreadyInArtifact,
    prNumber: num,
    integrityOk: !needsIntegrity || integrity.ok,
  });

  if (verdict.action === 'fail') {
    console.error(`preserve: ERROR pr-${num}: ${verdict.reason}`);
    failures += 1;
    continue;
  }
  if (verdict.action === 'skip') {
    console.log(`preserve: skip pr-${num} (${verdict.reason})`);
  }
}

if (strict && failures > 0) {
  console.error(`preserve: ${failures} preview folder(s) could not be preserved; aborting deploy`);
  process.exit(1);
}

const deployed = listPrNumbersFromDeploySite(
  existsSync(prPreviewRoot) ? readdirSync(prPreviewRoot) : [],
);

if (strict && deployed.length > 0) {
  const folderCheck = verifyStrictPreviewFolders(deploySite, ROOT_URL, deployed);
  if (!folderCheck.ok) {
    for (const err of folderCheck.errors) {
      console.error(`preserve: ERROR ${err}`);
    }
    console.error('preserve: strict preview integrity check failed; aborting deploy');
    process.exit(1);
  }
}

const manifestPath = join(prPreviewRoot, '_deployed-previews.json');
writeFileSync(manifestPath, buildDeployedPreviewsManifest(deployed), 'utf8');
console.log(`preserve: wrote manifest (${deployed.length} preview folders)`);
