import { redactSensitive } from './redact-sensitive.mjs';

export const REPORT_SECTION_MARKER = '=== Cursor 代理人最終報告 ===';

/** Lines in the report section that announce the final verdict (content masked). */
const VERDICT_HEADER_RE =
  /^#{1,3}\s*(判定|總判定|總判|Verdict|Overall verdict)\b.*$/gim;

const VERDICT_INLINE_RE =
  /^(\s*[-*]*\s*)(#{1,3}\s*)?(判定|總判|總判定|Overall verdict|Verdict)\s*[:：]?\s*.*$/gim;

const MASKED_LINE = '[VERDICT_MASKED]';

/**
 * @param {string} line
 * @returns {boolean}
 */
function isVerdictSummaryLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  if (/^\*\*總判\*\*/.test(trimmed)) {
    return true;
  }
  if (/^\*\*Overall verdict/i.test(trimmed)) {
    return true;
  }
  if (/^Overall verdict:\s*\*\*(PASS|FAIL)\*\*/i.test(trimmed)) {
    return true;
  }
  if (/^\*\*(PASS|FAIL|NEEDS FIX(?:ES)?)\*\*/i.test(trimmed)) {
    return true;
  }
  if (/^##\s*判定[：:]\s*\*\*(PASS|FAIL|NEEDS FIX)/i.test(trimmed)) {
    return true;
  }
  if (/^\*\*整體[：:]\s*(PASS|FAIL)\*\*/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * @param {string} reportBody
 * @returns {string}
 */
export function maskReportSection(reportBody) {
  const lines = reportBody.split('\n');
  const out = [];
  let maskNextContent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeader =
      /^#{1,3}\s*(判定|總判定|總判|Verdict|Overall verdict)\b/i.test(trimmed) ||
      /^(總判|判定)\s*[:：]/i.test(trimmed) ||
      /^##\s*PR #\d+.*總判/i.test(trimmed);

    if (isHeader) {
      out.push(`${line.split(/[:：]/)[0].replace(/\*+/g, '').trim()}：${MASKED_LINE}`);
      maskNextContent = true;
      continue;
    }

    if (maskNextContent && trimmed.length > 0 && !trimmed.startsWith('#')) {
      if (
        /\b(PASS|FAIL|NEEDS FIX|不通過|通過)\b/i.test(trimmed) ||
        /整體/.test(trimmed)
      ) {
        out.push(MASKED_LINE);
        maskNextContent = false;
        continue;
      }
      maskNextContent = false;
    }

    if (isVerdictSummaryLine(line)) {
      out.push(MASKED_LINE);
      continue;
    }

    out.push(line);
  }

  let joined = out.join('\n');
  joined = joined.replace(VERDICT_HEADER_RE, (m) => {
    const head = m.split(/[:：]/)[0];
    return `${head}：${MASKED_LINE}`;
  });
  joined = joined.replace(VERDICT_INLINE_RE, MASKED_LINE);
  return joined;
}

/**
 * @param {string} rawLog
 * @returns {{ masked: string, hadReportSection: boolean }}
 */
export function maskVerdictInLog(rawLog) {
  const idx = rawLog.indexOf(REPORT_SECTION_MARKER);
  if (idx === -1) {
    return { masked: redactSensitive(rawLog), hadReportSection: false };
  }
  const before = rawLog.slice(0, idx + REPORT_SECTION_MARKER.length);
  const report = rawLog.slice(idx + REPORT_SECTION_MARKER.length);
  const maskedReport = maskReportSection(report);
  return {
    masked: redactSensitive(before + maskedReport),
    hadReportSection: true,
  };
}
