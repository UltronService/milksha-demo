import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { SAMPLE_MS_A } from '../mock/fixtures';
import { server, PORT } from '../mock/server.mjs';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

window.getComputedStyle = () =>
  ({
    width: '0px',
    height: '0px',
    getPropertyValue: () => '',
  }) as CSSStyleDeclaration;

/** Align "today" with fixture records (2026-10-20 Taipei) for date-range filters. */
beforeEach(() => {
  vi.useFakeTimers({ now: SAMPLE_MS_A + 3_600_000, shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

beforeAll(async () => {
  if (server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
});

export const mockApiBase = `http://127.0.0.1:${PORT}`;

export async function mockControl(body: Record<string, unknown>): Promise<void> {
  await fetch(`${mockApiBase}/__mock/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
