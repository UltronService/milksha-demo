import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { displayText } from './display-value';
import { formatReceiveDelayCell } from './format-box-report-delay';
import type { BoardBoxReportRow } from './types';

const columns: ColumnsType<BoardBoxReportRow> = [
  {
    title: '盒子代號',
    dataIndex: 'boxCode',
    key: 'boxCode',
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
    dataIndex: 'delayMs',
    key: 'delayMs',
    render: (value: number | null) => displayText(formatReceiveDelayCell(value)),
  },
  {
    title: '時鐘狀態',
    dataIndex: 'clockStatus',
    key: 'clockStatus',
    render: (value: string) => displayText(value),
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
          rowKey={(row) => `${row.boxCode}-${row.ip}`}
          columns={columns}
          dataSource={rows}
          style={{ marginTop: 8 }}
        />
      )}
    </div>
  );
}
