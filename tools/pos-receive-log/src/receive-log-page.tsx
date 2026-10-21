import { Alert, DatePicker, Empty, Input, Space, Spin, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { displayCount, displayText } from './display-value';
import { fetchReceiveLogs, FetchReceiveLogsError } from './fetch-receive-logs';
import {
  formatRawPayloadForDisplay,
  POS_RAW_MESSAGE_BODY_STYLE,
  POS_RAW_MESSAGE_MAX_HEIGHT_PX,
} from './format-raw-payload-display';
import { formatTaipeiWithMs } from './format-taipei-time';
import { buildIntakeMessageSummaryLines } from './intake-message-summary-lines';
import { formatProcessingDuration, formatSentTimeCell } from './pos-timing-display';
import { sourceTypeLabel } from './source-type-label';
import { BoxReportsSubtable } from './box-reports-subtable';
import type { EntryType, ReceiveLogRecord, ReceiveResult } from './types';

const TaipeiRangePicker = DatePicker.RangePicker;

export interface ReceiveLogPageProps {
  apiBaseUrl: string;
  initialStoreNumber?: string;
  refreshIntervalMs?: number;
}

function resultTag(result: ReceiveResult): JSX.Element {
  if (result === 'success') {
    return <Tag color="success">success</Tag>;
  }
  if (result === 'failed') {
    return <Tag color="error">failed</Tag>;
  }
  return <Tag>skipped</Tag>;
}

function ExpandedRow({ record }: { record: ReceiveLogRecord }): JSX.Element {
  const renderZone = (title: string, zone: ReceiveLogRecord['zones']['ready']) => (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text strong>{title}</Typography.Text>
      <ul data-testid={`zone-numbers-${title}`}>
        {zone.numbers.length === 0 ? (
          <li>—</li>
        ) : (
          zone.numbers.map((item) => (
            <li key={`${item.number}-${item.sourceType ?? 'na'}`}>
              {item.number}{' '}
              <Tag data-testid="source-type-tag">{sourceTypeLabel(item.sourceType)}</Tag>
            </li>
          ))
        )}
      </ul>
      {zone.notShown.length > 0 && (
        <div data-testid="not-shown-reasons">
          {zone.notShown.map((n) => (
            <div key={n.number}>
              {n.number}：{n.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div data-testid="expanded-row">
      {renderZone('請取餐', record.zones.ready)}
      {renderZone('準備中', record.zones.preparing)}
      {record.rejectedSends.length > 0 && (
        <div data-testid="rejected-sends">
          <Typography.Text strong>拒絕送出</Typography.Text>
          <ul>
            {record.rejectedSends.map((r) => (
              <li key={r.number}>{r.number}：{r.reason}</li>
            ))}
          </ul>
        </div>
      )}
      <BoxReportsSubtable rows={record.boxReports} />
      {record.posTimeStmpRaw ? (
        <div style={{ marginBottom: 12 }}>
          <Typography.Text strong>POS timeStmp（raw）</Typography.Text>
          <div data-testid="pos-time-stmp-raw">{record.posTimeStmpRaw}</div>
        </div>
      ) : null}
      <div data-testid="message-summary" style={{ marginBottom: 12 }}>
        <Typography.Text strong>訊息摘要</Typography.Text>
        <div data-testid="message-summary-body">
          {buildIntakeMessageSummaryLines(record.messageSummary).map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      </div>
      <div data-testid="pos-raw-message">
        <Typography.Text strong>POS 原始訊息</Typography.Text>
        <pre
          data-testid="raw-payload"
          style={POS_RAW_MESSAGE_BODY_STYLE}
          data-max-height-px={POS_RAW_MESSAGE_MAX_HEIGHT_PX}
        >
          {record.rawPayload.length > 0
            ? formatRawPayloadForDisplay(record.rawPayload)
            : '無原始內容'}
        </pre>
        {record.rawPayloadTruncated ? (
          <Typography.Text type="secondary" data-testid="raw-payload-truncated">
            內容過長，已截斷
          </Typography.Text>
        ) : null}
      </div>
    </div>
  );
}

export function ReceiveLogPage({
  apiBaseUrl,
  initialStoreNumber = '',
  refreshIntervalMs = 2000,
}: ReceiveLogPageProps): JSX.Element {
  const [storeNumber, setStoreNumber] = useState(initialStoreNumber);
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>(() => [
    dayjs().subtract(1, 'day'),
    dayjs().add(1, 'hour'),
  ]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [records, setRecords] = useState<ReceiveLogRecord[]>([]);
  const filteredRecords = useMemo(
    () =>
      records.filter(
        (r) =>
          r.receivedAtMs >= range[0].valueOf() && r.receivedAtMs <= range[1].valueOf(),
      ),
    [records, range],
  );
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await fetchReceiveLogs(
        {
          storeId: storeNumber.trim(),
          limit: 1000,
        },
        apiBaseUrl,
      );
      if (body.status === '已停用') {
        setDisabled(true);
        setRecords([]);
        setError(null);
        return;
      }
      setDisabled(false);
      setRecords(body.records);
      setError(null);
    } catch (e) {
      const msg = e instanceof FetchReceiveLogsError ? e.message : '載入失敗';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, storeNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }
    const id = window.setInterval(() => {
      void load();
    }, refreshIntervalMs);
    return () => window.clearInterval(id);
  }, [autoRefresh, load, refreshIntervalMs]);

  const columns: ColumnsType<ReceiveLogRecord> = useMemo(
    () => [
      {
        title: '收件時間（Taipei）',
        dataIndex: 'receivedAtMs',
        key: 'receivedAtMs',
        render: (ms: number) => (
          <span data-testid="received-at-cell">{formatTaipeiWithMs(ms)} Taipei</span>
        ),
      },
      {
        title: '送件時間',
        key: 'sentAt',
        render: (_, row) => (
          <span data-testid="sent-at-cell">
            {formatSentTimeCell(row.posSentAtMs, row.posTimeStmpRaw, row.posSentAtIgnored)}
          </span>
        ),
      },
      {
        title: '作業時間（秒）',
        key: 'processingDuration',
        render: (_, row) => {
          const duration = formatProcessingDuration(row.receivedAtMs, row.posSentAtMs);
          return (
            <span data-testid="processing-duration-cell">
              {duration.text}
              {duration.clockSkew ? (
                <span data-testid="clock-skew-note"> 兩邊時鐘不同</span>
              ) : null}
            </span>
          );
        },
      },
      {
        title: '門市',
        dataIndex: 'storeNumber',
        key: 'storeNumber',
        render: (value: string) => displayText(value),
      },
      {
        title: '入口',
        dataIndex: 'entry',
        key: 'entry',
        render: (value: EntryType) => displayText(value),
      },
      {
        title: '來源 IP',
        dataIndex: 'sourceIp',
        key: 'sourceIp',
        render: (value: string) => displayText(value),
      },
      {
        title: '請取餐',
        key: 'readyCount',
        render: (_, row) => displayCount(row.zones.ready.count),
      },
      {
        title: '準備中',
        key: 'prepCount',
        render: (_, row) => displayCount(row.zones.preparing.count),
      },
      {
        title: '結果',
        dataIndex: 'result',
        key: 'result',
        render: (result: ReceiveResult) => resultTag(result),
      },
    ],
    [],
  );

  const tableData = disabled ? [] : filteredRecords;

  return (
    <div style={{ padding: 16 }} data-testid="receive-log-page">
      <Typography.Title level={4}>POS 收件紀錄（唯讀）</Typography.Title>
      <Space wrap style={{ marginBottom: 16 }} data-testid="filter-bar">
        <Input
          aria-label="門市編號"
          placeholder="空白＝全部門市"
          value={storeNumber}
          onChange={(e) => setStoreNumber(e.target.value)}
          style={{ width: 200 }}
        />
        <TaipeiRangePicker
          showTime
          value={range}
          onChange={(vals) => {
            if (vals && vals[0] && vals[1]) {
              setRange([vals[0], vals[1]]);
            }
          }}
        />
        <span>
          自動更新{' '}
          <Switch checked={autoRefresh} onChange={setAutoRefresh} data-testid="auto-refresh-switch" />
        </span>
      </Space>

      {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} /> : null}
      {disabled ? (
        <Alert type="warning" message="已停用" data-testid="disabled-banner" showIcon />
      ) : null}

      <Spin spinning={loading}>
        <Table<ReceiveLogRecord>
          rowKey="id"
          columns={columns}
          dataSource={tableData}
          pagination={{ pageSize: 50 }}
          expandable={{
            expandedRowRender: (record) => <ExpandedRow record={record} />,
            expandedRowKeys,
            onExpandedRowsChange: (keys) => setExpandedRowKeys([...keys]),
          }}
          locale={{
            emptyText: disabled ? ' ' : <Empty description="此條件下沒有收件紀錄" />,
          }}
        />
      </Spin>
    </div>
  );
}
