import { REPORT_SECTION_MARKER } from './mask-verdict.mjs';

/**
 * @param {string} line
 * @returns {boolean}
 */
export function isVerdictCarrierLine(line) {
  const t = line.trim();
  if (!t) {
    return false;
  }
  if (/^#{1,3}\s*(判定|總判定|總判|Verdict|Overall verdict)\b/i.test(t)) {
    return true;
  }
  if (/^##\s*判定[：:]/.test(t)) {
    return true;
  }
  if (/^##\s*PR #\d+.*總判/i.test(t)) {
    return true;
  }
  if (/^\*\*(PASS|FAIL|NEEDS FIX(?:ES)?)\*\*\s*$/i.test(t)) {
    return true;
  }
  if (/^\*\*(PASS|FAIL)\*\*\s+[（(—\-]/.test(t)) {
    return true;
  }
  if (/^\*\*Overall/i.test(t) && /\b(PASS|FAIL)\b/i.test(t)) {
    return true;
  }
  if (/^\*\*Verdict file:\*\*/i.test(t)) {
    return true;
  }
  if (/^\*\*PR #49 verdict/i.test(t)) {
    return true;
  }
  if (/^\*\*Overall public retest:/i.test(t)) {
    return true;
  }
  if (/^##\s*\*\*(PASS|FAIL)\*\*\s*$/i.test(t)) {
    return true;
  }
  if (/Overall verdict updated to/i.test(t)) {
    return true;
  }
  if (/^\*\*結論\*\*[:：]/.test(t)) {
    return true;
  }
  if (/^\*\*總判\*\*[:：]/.test(t)) {
    return true;
  }
  if (/^\*\*Overall verdict/i.test(t)) {
    return true;
  }
  if (/^##\s*判定[：:]\s*\*\*(PASS|FAIL|NEEDS FIX)/i.test(t)) {
    return true;
  }
  if (/^\*\*整體[：:]\s*(PASS|FAIL)/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Remove verdict-carrying lines from the agent report section only.
 * @param {string} rawLog
 * @returns {{ text: string, removed: string[] }}
 */
export function stripVerdictLinesFromLog(rawLog) {
  const idx = rawLog.indexOf(REPORT_SECTION_MARKER);
  if (idx === -1) {
    return { text: rawLog, removed: [] };
  }
  const before = rawLog.slice(0, idx + REPORT_SECTION_MARKER.length);
  const report = rawLog.slice(idx + REPORT_SECTION_MARKER.length);
  const removed = [];
  const kept = [];
  for (const line of report.split('\n')) {
    if (isVerdictCarrierLine(line)) {
      removed.push(line);
      continue;
    }
    kept.push(line);
  }
  return { text: before + kept.join('\n'), removed };
}
