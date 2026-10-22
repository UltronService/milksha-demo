import { describe, expect, it } from 'vitest';
import {
  compareBoxCount,
  compareNotReportedCount,
  computeBoxReportsMainTableMetrics,
  countNotReportedBoxes,
  readBoxReportsFeedShape,
  type ReceiveLogRecordForSort,
} from '../src/box-reports-main-table';
import type { BoardBoxReportRow } from '../src/types';

describe('boxReports main table metrics', () => {
  it('missing or non-array feed shape shows dash for both columns', () => {
    expect(readBoxReportsFeedShape({})).toBe('missing');
    expect(readBoxReportsFeedShape({ boxReports: null })).toBe('invalid');
    expect(readBoxReportsFeedShape({ boxReports: 'x' })).toBe('invalid');
    expect(computeBoxReportsMainTableMetrics('missing', [])).toEqual({
      boxCount: 'dash',
      notReportedCount: 'dash',
    });
    expect(computeBoxReportsMainTableMetrics('invalid', [])).toEqual({
      boxCount: 'dash',
      notReportedCount: 'dash',
    });
  });

  it('empty array shows zero for both columns', () => {
    expect(computeBoxReportsMainTableMetrics('array', [])).toEqual({
      boxCount: 0,
      notReportedCount: 0,
    });
  });

  it('counts not_reported and null status; unknown status excluded from not reported', () => {
    const rows: BoardBoxReportRow[] = [
      { boxId: 'a', ip: '1.1.1.1', status: 'reported', delaySec: 1, clockSynced: true, clockOffsetMs: 0 },
      { boxId: 'b', ip: '1.1.1.2', status: 'not_reported', delaySec: null, clockSynced: null, clockOffsetMs: null },
      { boxId: 'c', ip: '1.1.1.3', status: null, delaySec: null, clockSynced: null, clockOffsetMs: null },
      {
        boxId: 'd',
        ip: '1.1.1.4',
        status: null,
        hasUnknownStatus: true,
        delaySec: null,
        clockSynced: null,
        clockOffsetMs: null,
      },
    ];
    expect(computeBoxReportsMainTableMetrics('array', rows)).toEqual({
      boxCount: 4,
      notReportedCount: 2,
    });
    expect(countNotReportedBoxes(rows)).toBe(2);
  });

  it('sorts numeric counts before dash rows (ascending compare fn)', () => {
    const dashRow: ReceiveLogRecordForSort = { boxReportsFeedShape: 'missing', boxReports: [] };
    const zeroRow: ReceiveLogRecordForSort = { boxReportsFeedShape: 'array', boxReports: [] };
    const twoRow: ReceiveLogRecordForSort = {
      boxReportsFeedShape: 'array',
      boxReports: [
        { boxId: 'a', ip: '1', status: 'reported', delaySec: 0, clockSynced: true, clockOffsetMs: 0 },
        { boxId: 'b', ip: '2', status: 'reported', delaySec: 0, clockSynced: true, clockOffsetMs: 0 },
      ],
    };
    expect(compareBoxCount(zeroRow, twoRow, 'ascend')).toBeLessThan(0);
    expect(compareBoxCount(twoRow, dashRow, 'ascend')).toBeLessThan(0);
    expect(compareBoxCount(zeroRow, dashRow, 'ascend')).toBeLessThan(0);
    expect(compareNotReportedCount(zeroRow, dashRow, 'ascend')).toBeLessThan(0);
  });

  it('keeps dash rows last when Ant Design applies descend (negated compare)', () => {
    const dashRow: ReceiveLogRecordForSort = { boxReportsFeedShape: 'missing', boxReports: [] };
    const zeroRow: ReceiveLogRecordForSort = { boxReportsFeedShape: 'array', boxReports: [] };
    const twoRow: ReceiveLogRecordForSort = {
      boxReportsFeedShape: 'array',
      boxReports: [
        { boxId: 'a', ip: '1', status: 'reported', delaySec: 0, clockSynced: true, clockOffsetMs: 0 },
        { boxId: 'b', ip: '2', status: 'reported', delaySec: 0, clockSynced: true, clockOffsetMs: 0 },
      ],
    };
    const applyAntdSort = (
      cmp: (a: ReceiveLogRecordForSort, b: ReceiveLogRecordForSort, order: 'ascend' | 'descend') => number,
      order: 'ascend' | 'descend',
    ) =>
      [zeroRow, twoRow, dashRow].sort((a, b) => {
        const result = cmp(a, b, order);
        return order === 'ascend' ? result : -result;
      });

    expect(applyAntdSort(compareBoxCount, 'ascend').map((r) => r.boxReports.length)).toEqual([0, 2, 0]);
    expect(applyAntdSort(compareBoxCount, 'descend').map((r) => r.boxReports.length)).toEqual([2, 0, 0]);
    expect(applyAntdSort(compareNotReportedCount, 'descend')[2].boxReportsFeedShape).toBe('missing');
  });
});
