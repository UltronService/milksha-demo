import { REPORT_SECTION_MARKER } from './mask-verdict.mjs';

const TASK_END = REPORT_SECTION_MARKER;

const REPORT_LEAK_PATTERNS = [
  /\bPASS\b/i,
  /\bFAIL\b/i,
  /NEEDS\s+FIX(?:ES)?/i,
  /##\s*判定[：:]\s*\*\*(?:PASS|FAIL)/i,
  /\*\*Overall verdict:\s*(?:PASS|FAIL)\*\*/i,
  /整體[：:]\s*(?:PASS|FAIL)/i,
  /總判[：:].*(?:PASS|FAIL)/i,
  /Verdict:\s*(?:PASS|FAIL)/i,
];

/**
 * @param {string} maskedLog
 * @returns {string[]} leak descriptions
 */
export function findVerdictLeaksInMaskedLog(maskedLog) {
  const idx = maskedLog.indexOf(TASK_END);
  const report = idx === -1 ? maskedLog : maskedLog.slice(idx + TASK_END.length);
  const leaks = [];
  for (const re of REPORT_LEAK_PATTERNS) {
    const m = report.match(re);
    if (m) {
      leaks.push(`report section matches ${re.source} → "${m[0].slice(0, 40)}"`);
    }
  }
  return leaks;
}

/**
 * @param {string} maskedLog
 */
export function assertMaskedSafeForJev(maskedLog) {
  const leaks = findVerdictLeaksInMaskedLog(maskedLog);
  if (leaks.length > 0) {
    throw new Error(`masked log still contains verdict leaks: ${leaks.join('; ')}`);
  }
}
