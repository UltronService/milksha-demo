import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { displayText } from './display-value';
import { formatDelaySecondsCell } from './format-box-report-delay';
import type { BoardBoxReportRow } from './types';

function formatClockStatus(row: BoardBoxReportRow): string {
  if (row.status === 'not_reported' || row.status === null) {
    return '';
  }
  if (row.clockSynced === true) {
    return '已校正';
  }
  if (row.clockSynced === false) {
    return '未校正';
  }
  return '';
}

function formatDelayCell(row: BoardBoxReportRow): string {
  if (row.status === 'not_reported') {
    return '未回報';
  }
  if (row.status !== 'reported') {
    return '';
  }
  return formatDelaySecondsCell(row.delaySec);
}

const columns: ColumnsType<BoardBoxReportRow> = [
  {
    title: '盒子代號',
    dataIndex: 'boxId',
    key: 'boxId',
    render: (value: string) => displayText(value),
  },
  {
    title: 'IP',
    dataIndex: 'ip',
    key: 'ip',
    render: (value: string) => displayText(value),
  },
  {
    title: '晚幾秒',
    key: 'delaySec',
    render: (_, row) => displayText(formatDelayCell(row)),
  },
  {
    title: '時鐘狀態',
    key: 'clockStatus',
    render: (_, row) => displayText(formatClockStatus(row)),
  },
];

export function BoxReportsSubtable({ rows }: { rows: BoardBoxReportRow[] }): JSX.Element {
  return (
    <div style={{ marginBottom: 12 }} data-testid="box-reports-section">
      <Typography.Text strong>盒子回報</Typography.Text>
      {rows.length === 0 ? (
        <div data-testid="box-reports-empty">未回報</div>
      ) : (
        <Table<BoardBoxReportRow>
          size="small"
          pagination={false}
          rowKey={(row) => `${row.boxId}-${row.ip}`}
          columns={columns}
          dataSource={rows}
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}
