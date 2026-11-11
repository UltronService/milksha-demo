import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { maskVerdictInLog, REPORT_SECTION_MARKER } from '../lib/mask-verdict.mjs';

const FIXTURE_ROOT = process.env.JEV_QA_LOGS_DIR ?? '/tmp/jev-qa-logs';

describe('maskVerdictInLog', () => {
  it('masks explicit PASS line in case-001 report', () => {
    const raw = readFileSync(`${FIXTURE_ROOT}/case-001/log.txt`, 'utf8');
    const { masked, hadReportSection } = maskVerdictInLog(raw);
    assert.equal(hadReportSection, true);
    assert.match(masked, /\[VERDICT_MASKED\]/);
    assert.doesNotMatch(masked, /## 判定：\*\*PASS\*\*/);
  });

  it('masks 總判定 FAIL block in case-007', () => {
    const raw = readFileSync(`${FIXTURE_ROOT}/case-007/log.txt`, 'utf8');
    const { masked } = maskVerdictInLog(raw);
    assert.doesNotMatch(masked, /整體：FAIL/);
    assert.match(masked, /\[VERDICT_MASKED\]/);
  });

  it('keeps task instruction template PASS or NEEDS FIXES', () => {
    const raw = readFileSync(`${FIXTURE_ROOT}/case-001/log.txt`, 'utf8');
    const { masked } = maskVerdictInLog(raw);
    assert.match(masked, /verdict PASS or NEEDS FIXES/);
    assert.match(masked, /=== QA 任務 ===/);
  });

  it('masks Overall verdict in case-013', () => {
    const raw = readFileSync(`${FIXTURE_ROOT}/case-013/log.txt`, 'utf8');
    const { masked } = maskVerdictInLog(raw);
    assert.doesNotMatch(masked, /\*\*Overall verdict: PASS\*\*/i);
  });
});
