import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildManyRecords, buildSampleRecord, SAMPLE_MS_A } from '../mock/fixtures';
import { POS_RAW_MESSAGE_MAX_HEIGHT_PX } from '../src/format-raw-payload-display';
import { ReceiveLogPage } from '../src/receive-log-page';
import realFeedRecord from './fixtures/pos-intake-log-feed-record.json';
import { mockApiBase, mockControl } from './setup';

async function renderAndWaitForRows(store = 'zz-qa-store-a') {
  render(<ReceiveLogPage apiBaseUrl={mockApiBase} initialStoreNumber={store} />);
  await waitFor(() => {
    expect(screen.getAllByText(store).length).toBeGreaterThan(0);
  });
  return userEvent.setup();
}

async function expandFirstRow(user: ReturnType<typeof userEvent.setup>) {
  const expandButtons = screen.getAllByRole('button', { name: /expand/i });
  await user.click(expandButtons[0]);
  return screen.getByTestId('expanded-row');
}

afterEach(async () => {
  cleanup();
  await mockControl({ reset: true, mode: 'ok' });
});

describe('frontend TDD scope 1–28', () => {
  it('TDD-1: POS 原始訊息區僅在展開後出現', async () => {
    await renderAndWaitForRows();
    expect(screen.queryByTestId('pos-raw-message')).toBeNull();
    expect(screen.queryByText('POS 原始訊息')).toBeNull();
    const user = userEvent.setup();
    await expandFirstRow(user);
    expect(screen.getByTestId('pos-raw-message')).toBeInTheDocument();
  });

  it('TDD-2: 展開後可見訊息摘要、POS 原始訊息與請取餐區塊', async () => {
    const user = await renderAndWaitForRows();
    const expanded = await expandFirstRow(user);
    expect(within(expanded).getByText('訊息摘要')).toBeInTheDocument();
    expect(within(expanded).getByText('POS 原始訊息')).toBeInTheDocument();
    expect(within(expanded).getByText('請取餐')).toBeInTheDocument();
    expect(within(expanded).getByTestId('rejected-sends')).toBeInTheDocument();
  });

  it('TDD-3: 空 rawPayload 或壞 JSON 仍可展開不白屏', async () => {
    const store = 'zz-tdd-3';
    await mockControl({
      reset: true,
      record: buildSampleRecord({ id: 'empty-payload', storeNumber: store, rawPayload: '' }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('expanded-row')).toBeInTheDocument();
    expect(screen.getByTestId('raw-payload').textContent).toContain('無原始內容');

    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'broken-json',
        storeNumber: store,
        rawPayload: '{"broken":',
      }),
    });
    cleanup();
    const user2 = await renderAndWaitForRows(store);
    await expandFirstRow(user2);
    expect(screen.getByTestId('raw-payload').textContent).toContain('{"broken":');
  });

  it('TDD-4: 舊紀錄無 rawPayload 仍顯示訊息摘要含大小與處理結果', async () => {
    await mockControl({ reset: true, record: realFeedRecord });
    const user = await renderAndWaitForRows('s030570');
    const expanded = await expandFirstRow(user);
    const summary = within(expanded).getByTestId('message-summary-body');
    expect(summary.textContent).toContain('1794');
    expect(summary.textContent).toMatch(/處理結果/);
    expect(summary.textContent).toContain('accepted');
  });

  it('TDD-5: 不得出現 raw payload 文案', async () => {
    const user = await renderAndWaitForRows();
    await expandFirstRow(user);
    expect(screen.queryByText(/raw payload/i)).toBeNull();
  });

  it('TDD-6: 有全文時訊息摘要與 POS 原始訊息為兩區', async () => {
    const user = await renderAndWaitForRows();
    await expandFirstRow(user);
    expect(screen.getByTestId('message-summary')).toBeInTheDocument();
    expect(screen.getByTestId('pos-raw-message')).toBeInTheDocument();
  });

  it('TDD-7: 有非空 rawPayload 時全文標題為 POS 原始訊息', async () => {
    const user = await renderAndWaitForRows();
    const expanded = await expandFirstRow(user);
    expect(within(expanded).getByText('POS 原始訊息')).toBeInTheDocument();
  });

  it('TDD-8: 全文區 max-height 320px 且可捲動', async () => {
    const user = await renderAndWaitForRows();
    await expandFirstRow(user);
    const pre = screen.getByTestId('raw-payload');
    expect(pre.getAttribute('data-max-height-px')).toBe(String(POS_RAW_MESSAGE_MAX_HEIGHT_PX));
    expect(pre.style.maxHeight).toBe(`${POS_RAW_MESSAGE_MAX_HEIGHT_PX}px`);
    expect(pre.style.overflow).toBe('auto');
    expect(pre.style.fontFamily).toContain('monospace');
  });

  it('TDD-9: 短內容全文區仍使用單一 pre 容器', async () => {
    const store = 'zz-tdd-9';
    await mockControl({
      reset: true,
      record: buildSampleRecord({ id: 'short', storeNumber: store, rawPayload: '{"x":1}' }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getAllByTestId('raw-payload')).toHaveLength(1);
  });

  it('TDD-10: 非 JSON 原文顯示', async () => {
    const store = 'zz-tdd-10';
    await mockControl({
      reset: true,
      record: buildSampleRecord({ id: 'plain', storeNumber: store, rawPayload: 'plain-text\nline2' }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toBe('plain-text\nline2');
  });

  it('TDD-11: JSON 縮排顯示', async () => {
    const store = 'zz-tdd-11';
    await mockControl({
      reset: true,
      record: buildSampleRecord({ id: 'json', storeNumber: store, rawPayload: '{"a":1}' }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    const text = screen.getByTestId('raw-payload').textContent ?? '';
    expect(text).toContain('"a": 1');
    expect(text).toContain('\n');
  });

  it('TDD-12: 壞 JSON 照原文', async () => {
    const store = 'zz-tdd-12';
    await mockControl({
      reset: true,
      record: buildSampleRecord({ id: 'bad', storeNumber: store, rawPayload: '{"a":' }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toBe('{"a":');
  });

  it('TDD-13: 空 payload 且未截斷只顯示無原始內容', async () => {
    const store = 'zz-tdd-13';
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'empty',
        storeNumber: store,
        rawPayload: '',
        rawPayloadTruncated: false,
      }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toBe('無原始內容');
    expect(screen.queryByTestId('raw-payload-truncated')).toBeNull();
  });

  it('TDD-14: 截斷且空內容先無原始內容再截斷提示', async () => {
    const store = 'zz-tdd-14';
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'trunc-empty',
        storeNumber: store,
        rawPayload: '',
        rawPayloadTruncated: true,
      }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toBe('無原始內容');
    expect(screen.getByTestId('raw-payload-truncated')).toHaveTextContent('內容過長，已截斷');
  });

  it('TDD-15: 截斷且有內容顯示內文與截斷提示', async () => {
    const store = 'zz-tdd-15';
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'trunc-body',
        storeNumber: store,
        rawPayload: '{"token":"<REDACTED>"}',
        rawPayloadTruncated: true,
      }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toContain('<REDACTED>');
    expect(screen.getByTestId('raw-payload-truncated')).toHaveTextContent('內容過長，已截斷');
  });

  it('TDD-16: 未截斷不顯示截斷提示', async () => {
    const user = await renderAndWaitForRows();
    await expandFirstRow(user);
    expect(screen.queryByTestId('raw-payload-truncated')).toBeNull();
  });

  it('TDD-17: <REDACTED> 照原樣顯示', async () => {
    const user = await renderAndWaitForRows();
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toContain('<REDACTED>');
  });

  it('TDD-18: script 標籤不執行', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const store = 'zz-tdd-18';
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'xss-script',
        storeNumber: store,
        rawPayload: '<script>alert(1)</script>',
      }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toContain('<script>');
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('TDD-19: img onerror 不執行', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    const store = 'zz-tdd-19';
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'xss-img',
        storeNumber: store,
        rawPayload: '<img src=x onerror=alert(1)>',
      }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toContain('<img');
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('TDD-20: 未展開時惡意字串不在 DOM', async () => {
    const marker = 'UNIQUE_XSS_MARKER_20';
    const store = 'zz-tdd-20';
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'xss-hidden',
        storeNumber: store,
        rawPayload: `<script>${marker}</script>`,
      }),
    });
    await renderAndWaitForRows(store);
    expect(document.documentElement.innerHTML).not.toContain(marker);
  });

  it('TDD-21: 截斷後中文不亂碼', async () => {
    const payload = '測試號碼結尾';
    const store = 'zz-tdd-21';
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'zh',
        storeNumber: store,
        rawPayload: payload,
        rawPayloadTruncated: true,
      }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toBe(payload);
  });

  it('TDD-22: 截斷後表情不破碎', async () => {
    const payload = '飲料🧋結尾';
    const store = 'zz-tdd-22';
    await mockControl({
      reset: true,
      record: buildSampleRecord({
        id: 'emoji',
        storeNumber: store,
        rawPayload: payload,
        rawPayloadTruncated: true,
      }),
    });
    const user = await renderAndWaitForRows(store);
    await expandFirstRow(user);
    expect(screen.getByTestId('raw-payload').textContent).toBe(payload);
  });

  it('TDD-26: 500 筆且展開大 payload 仍於時限內', async () => {
    const huge = `{"pad":"${'x'.repeat(50_000)}"}`;
    const bulk = buildManyRecords(500);
    bulk[0] = buildSampleRecord({
      id: 'bulk-0',
      receivedAtMs: SAMPLE_MS_A,
      storeNumber: 'zz-qa-store-a',
      rawPayload: huge,
    });
    await mockControl({ reset: true, records: bulk });
    const start = performance.now();
    const user = await renderAndWaitForRows();
    await expandFirstRow(user);
    const pre = screen.getByTestId('raw-payload');
    expect(pre.style.maxHeight).toBe('320px');
    expect(performance.now() - start).toBeLessThan(8000);
  });

  it('TDD-27: 未展開不把超大 payload 放進 DOM', async () => {
    const marker = `HUGE_PAYLOAD_MARKER_${'z'.repeat(2000)}`;
    const store = 'zz-tdd-27';
    await mockControl({
      reset: true,
      record: buildSampleRecord({ id: 'huge-collapsed', storeNumber: store, rawPayload: marker }),
    });
    await renderAndWaitForRows(store);
    expect(document.documentElement.innerHTML).not.toContain('HUGE_PAYLOAD_MARKER_');
  });

  it('TDD-28: 後端遮蔽 JSON 展開可見業務欄位與 REDACTED', async () => {
    await mockControl({ reset: true, record: realFeedRecord });
    const user = await renderAndWaitForRows('s030570');
    await expandFirstRow(user);
    const summary = screen.getByTestId('message-summary-body');
    expect(summary.textContent).toContain('1794');
    expect(screen.getByTestId('raw-payload').textContent).toBe('無原始內容');
    expect(document.documentElement.innerHTML).not.toContain('deadbeef');
  });
});
