import type { CSSProperties } from 'react';

/**
 * Pretty-print JSON payloads for display; non-JSON strings are returned unchanged.
 */
export function formatRawPayloadForDisplay(raw: string): string {
  if (raw.length === 0) {
    return raw;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export const POS_RAW_MESSAGE_MAX_HEIGHT_PX = 320;

export const POS_RAW_MESSAGE_BODY_STYLE: CSSProperties = {
  maxHeight: POS_RAW_MESSAGE_MAX_HEIGHT_PX,
  overflow: 'auto',
  margin: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};
