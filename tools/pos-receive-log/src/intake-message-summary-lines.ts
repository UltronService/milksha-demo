import type { IntakeMessageSummary } from './types';

export function buildIntakeMessageSummaryLines(summary: IntakeMessageSummary): string[] {
  const lines: string[] = [];
  if (summary.bodyByteSize !== null && Number.isFinite(summary.bodyByteSize)) {
    lines.push(`請求大小（bytes）：${summary.bodyByteSize}`);
  }
  if (summary.httpStatus !== null && Number.isFinite(summary.httpStatus)) {
    lines.push(`HTTP 狀態：${summary.httpStatus}`);
  }
  if (summary.disposition.trim() !== '') {
    lines.push(`處理結果：${summary.disposition}`);
  }
  if (summary.rejectReason !== null && summary.rejectReason.trim() !== '') {
    lines.push(`拒絕原因：${summary.rejectReason}`);
  }
  return lines;
}
