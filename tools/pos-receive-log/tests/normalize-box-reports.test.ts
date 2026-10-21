import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOX_REPORT_FIELD_KEYS,
  normalizeBoxReportsForIntakeLog,
} from '../src/normalize-box-reports';

describe('normalizeBoxReportsForIntakeLog (milksha-cloud PR #48)', () => {
  it('maps nested boxReports with delay in seconds and status reported', () => {
    const rows = normalizeBoxReportsForIntakeLog('rec-a', {
      boxReports: [
        {
          boxId: 'stb-qa-1',
          ip: '192.0.2.44',
          status: 'reported',
          delay: 2.5,
          clockSynced: true,
          clockOffsetMs: 120,
        },
        {
          boxId: 'stb-qa-2',
          ip: '192.0.2.45',
          status: 'not_reported',
          delay: null,
          clockSynced: false,
        },
      ],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      boxId: 'stb-qa-1',
      ip: '192.0.2.44',
      status: 'reported',
      delaySec: 2.5,
      clockSynced: true,
      clockOffsetMs: 120,
    });
    expect(rows[1]).toEqual({
      boxId: 'stb-qa-2',
      ip: '192.0.2.45',
      status: 'not_reported',
      delaySec: null,
      clockSynced: null,
      clockOffsetMs: null,
    });
  });

  it('returns empty when boxReports missing or empty', () => {
    expect(normalizeBoxReportsForIntakeLog('rec-a', {})).toEqual([]);
    expect(normalizeBoxReportsForIntakeLog('rec-a', { boxReports: [] })).toEqual([]);
  });

  it('supports configurable listKey and field keys', () => {
    const rows = normalizeBoxReportsForIntakeLog(
      'log-1',
      {
        boardBoxReports: [
          {
            boxCode: 'board-a',
            clientIp: '198.51.100.9',
            status: 'reported',
            delaySeconds: 3,
            clockSynced: false,
          },
        ],
      },
      {
        listKey: 'boardBoxReports',
        fieldKeys: {
          ...DEFAULT_BOX_REPORT_FIELD_KEYS,
          boxId: 'boxCode',
          ip: 'clientIp',
          delay: 'delaySeconds',
        },
      },
    );
    expect(rows).toEqual([
      {
        boxId: 'board-a',
        ip: '198.51.100.9',
        status: 'reported',
        delaySec: 3,
        clockSynced: false,
        clockOffsetMs: null,
      },
    ]);
  });
});
