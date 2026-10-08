#!/usr/bin/env node
/**
 * GitHub Pages origin + Playwright full-tree route (real cloud, CORS-safe).
 * main (a82cb9b) then #30 worktree, 3× a–e each.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GITHUB_PAGES_BASE } from './lib/github-pages-site-route.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'pr27-pages-route-matrix');
const RUNS = Number(process.env.PR27_MATRIX_RUNS || '3');
const MAIN_ROOT = process.env.MILKSHA_MAIN_SITE_ROOT || join(ROOT, 'wt-main');
const PRODUCT_ROOT = process.env.MILKSHA_PRODUCT_SITE_ROOT || join(ROOT, 'wt-product');
const SKIP_MAIN = process.env.PR27_MATRIX_SKIP_MAIN === '1';
const MAIN_RESULT = join(ART, 'main-a82cb9b.json');

mkdirSync(ART, { recursive: true });

function injectSiteFirebase(siteRoot) {
  const apiKey = String(process.env.MILKSHA_FIREBASE_API_KEY || '').trim();
  if (!apiKey) {
    return;
  }
  spawnSync('node', [join(ROOT, 'scripts', 'inject-firebase-config.mjs'), join(siteRoot, 'config', 'firebase.js')], {
    env: { ...process.env },
    stdio: 'pipe',
  });
}

function runSuite(label, siteRoot) {
  injectSiteFirebase(siteRoot);
  const items = [];
  const childEnv = {
    ...process.env,
    MILKSHA_PAGES_SITE_ROUTE: '1',
    MILKSHA_SITE_ROOT: siteRoot,
    MILKSHA_PAGES_BASE: GITHUB_PAGES_BASE,
    MILKSHA_QA_PATCH_RUNTIME: '0',
  };
  for (let i = 1; i <= RUNS; i += 1) {
    const child = spawnSync('node', [join(ROOT, 'scripts/public-pages-pr27-live-qa.mjs')], {
      cwd: ROOT,
      env: childEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let results = null;
    try {
      results = JSON.parse(readFileSync(join(ROOT, 'artifacts/pr27live/results.json'), 'utf8'));
    } catch {
      results = null;
    }
    const failed = results
      ? results.contexts.flatMap((c) =>
          c.lines.filter((l) => !l.pass).map((l) => ({
            context: c.context,
            check: l.check,
            error: l.error || l.rounds,
          })),
        )
      : [];
    items.push({
      run: i,
      code: child.status,
      failed,
      results,
      stderrTail: (child.stderr || '').slice(-1500),
    });
  }
  const pass = items.every(
    (x) => x.code === 0 && x.failed.length === 0 && x.results?.c030020Final?.empty,
  );
  const out = { label, siteRoot, pagesBase: GITHUB_PAGES_BASE, runs: RUNS, pass, items };
  writeFileSync(join(ART, `${label}.json`), JSON.stringify(out, null, 2));
  return out;
}

function loadExistingMain() {
  try {
    return JSON.parse(readFileSync(MAIN_RESULT, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  const summary = {
    generatedAt: new Date().toISOString(),
    method: 'playwright route github.io/milksha-demo/* from local tree; cloud APIs not intercepted',
    suites: [],
  };
  const keptMain = SKIP_MAIN ? loadExistingMain() : null;
  if (keptMain) {
    summary.suites.push(keptMain);
  } else {
    summary.suites.push(runSuite('main-a82cb9b', MAIN_ROOT));
  }
  const productHead = spawnSync('git', ['-C', PRODUCT_ROOT, 'rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  });
  const productLabel = `product-${(productHead.stdout || 'head').trim()}`;
  summary.suites.push(runSuite(productLabel, PRODUCT_ROOT));
  summary.pass = summary.suites.find((s) => s.label.startsWith('product'))?.pass === true;
  writeFileSync(join(ART, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify(
      {
        pass: summary.pass,
        main: summary.suites[0].pass,
        product: summary.suites[1].pass,
      },
      null,
      2,
    ),
  );
  if (!summary.pass) {
    process.exit(1);
  }
}

main();
