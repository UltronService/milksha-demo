export type EntryType = 'POS' | 'controller';

export type SourceType = 'store' | 'uber_eats' | 'foodpanda' | 'milksha_points';

export type ReceiveResult = 'success' | 'failed' | 'skipped';

export type BoxReportStatus = 'reported' | 'not_reported';

export interface ZoneNumberItem {
  number: string;
  sourceType?: SourceType;
}

export interface NotShownItem {
  number: string;
  reason: string;
}

export interface ZoneBlock {
  numbers: ZoneNumberItem[];
  count: number;
  notShown: NotShownItem[];
}

export interface RejectedSend {
  number: string;
  reason: string;
}

export interface IntakeMessageSummary {
  bodyByteSize: number | null;
  httpStatus: number | null;
  disposition: string;
  rejectReason: string | null;
}

export interface BoardBoxReportRow {
  boxId: string;
  ip: string;
  status: BoxReportStatus | null;
  /** Feed had a non-empty status string that is not reported / not_reported. */
  hasUnknownStatus?: boolean;
  delaySec: number | null;
  clockSynced: boolean | null;
  clockOffsetMs: number | null;
}

export type BoxReportsFeedShape = 'missing' | 'invalid' | 'array';

export interface ReceiveLogRecord {
  id: string;
  receivedAtMs: number;
  posTimeStmpRaw: string | null;
  posSentAtMs: number | null;
  /** Cloud ignored device send time when clock skew exceeds tolerance. */
  posSentAtIgnored: boolean | null;
  storeNumber: string;
  entry: EntryType;
  sourceIp: string;
  zones: {
    ready: ZoneBlock;
    preparing: ZoneBlock;
  };
  result: ReceiveResult;
  rejectedSends: RejectedSend[];
  messageSummary: IntakeMessageSummary;
  rawPayload: string;
  rawPayloadTruncated: boolean;
  boxReportsFeedShape: BoxReportsFeedShape;
  boxReports: BoardBoxReportRow[];
}

export type ReceiveLogsApiResponse =
  | { status: 'ok'; records: ReceiveLogRecord[] }
  | { status: '已停用' };

export interface FetchReceiveLogsParams {
  storeId: string;
  limit?: number;
}

export const DEFAULT_FETCH_LIMIT = 200;
export const MAX_FETCH_LIMIT = 1000;
