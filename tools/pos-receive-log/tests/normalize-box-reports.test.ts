import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOX_REPORT_FIELD_KEYS,
  normalizeBoxReportsForIntakeLog,
} from '../src/normalize-box-reports';

describe('normalizeBoxReportsForIntakeLog', () => {
  it('maps boxReports on feed record to rows keyed by intakeLogId', () => {
    const rows = normalizeBoxReportsForIntakeLog('rec-a', {
      boxReports: [
        {
          intakeLogId: 'rec-a',
          boxId: 'stb-qa-1',
          ip: '192.0.2.44',
          delayMs: 2500,
          clockSynced: true,
        },
        {
          intakeLogId: 'other-rec',
          boxId: 'stb-qa-2',
          ip: '192.0.2.45',
          delayMs: 1000,
          clockSynced: false,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      boxCode: 'stb-qa-1',
      ip: '192.0.2.44',
      delayMs: 2500,
      clockStatus: '已校正',
    });
  });

  it('returns empty when boxReports missing or no rows match intakeLogId', () => {
    expect(normalizeBoxReportsForIntakeLog('rec-a', {})).toEqual([]);
    expect(
      normalizeBoxReportsForIntakeLog('rec-a', {
        boxReports: [{ intakeLogId: 'other', boxId: 'x', ip: '1.1.1.1' }],
      }),
    ).toEqual([]);
  });

  it('supports lateSeconds field and custom field keys', () => {
    const rows = normalizeBoxReportsForIntakeLog(
      'log-1',
      {
        boardBoxReports: [
          {
            intakeLogId: 'log-1',
            boxCode: 'board-a',
            clientIp: '198.51.100.9',
            lateSeconds: 3,
            clockSynced: false,
          },
        ],
      },
      {
        listKey: 'boardBoxReports',
        fieldKeys: {
          ...DEFAULT_BOX_REPORT_FIELD_KEYS,
          boxCode: 'boxCode',
          ip: 'clientIp',
        },
      },
    );
    expect(rows).toEqual([
      {
        boxCode: 'board-a',
        ip: '198.51.100.9',
        delayMs: 3000,
        clockStatus: '未校正',
      },
    ]);
  });
});
