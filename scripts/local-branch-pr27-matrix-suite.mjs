#!/usr/bin/env node
/**
 * Local :8877 full-tree matrix (real cloud). No single-file inject.
 * Runs main (a82cb9b) then product branch worktrees, 3× a–e each.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stopSite, startSite, PORT_SITE } from '../tests/e2e/harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'artifacts', 'pr27-local-matrix');
const RUNS = Number(process.env.PR27_MATRIX_RUNS || '3');
const MAIN_ROOT = process.env.MILKSHA_MAIN_SITE_ROOT || join(ROOT, 'wt-main');
const PRODUCT_ROOT = process.env.MILKSHA_PRODUCT_SITE_ROOT || join(ROOT, 'wt-product');

mkdirSync(ART, { recursive: true });

function runSuite(label, siteRoot) {
  const items = [];
  process.env.MILKSHA_SITE_ROOT = siteRoot;
  process.env.MILKSHA_PAGES_BASE = `http://127.0.0.1:${PORT_SITE}`;
  process.env.MILKSHA_QA_PATCH_RUNTIME = '0';
  stopSite();
  return startSite().then(async function () {
    for (let i = 1; i <= RUNS; i += 1) {
      const child = spawnSync('node', [join(ROOT, 'scripts/public-pages-pr27-live-qa.mjs')], {
        cwd: ROOT,
        env: { ...process.env },
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
      (x) =>
        x.code === 0 &&
        x.failed.length === 0 &&
        x.results?.c030020Final?.empty,
    );
    const out = { label, siteRoot, runs: RUNS, pass, items };
    writeFileSync(join(ART, `${label}.json`), JSON.stringify(out, null, 2));
    return out;
  });
}

async function main() {
  const summary = {
    generatedAt: new Date().toISOString(),
    port: PORT_SITE,
    suites: [],
  };
  summary.suites.push(await runSuite('main-a82cb9b', MAIN_ROOT));
  summary.suites.push(await runSuite('product-a1372a0', PRODUCT_ROOT));
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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
