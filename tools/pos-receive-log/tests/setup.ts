import '@testing-library/jest-dom/vitest';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { FIXED_TEST_NOW_MS } from '../mock/test-clock.mjs';
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

/** Freezes `Date` / `Date.now` for the whole receive-log vitest suite (see mock/test-clock.mjs). */
function applyFixedTestClock(): void {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(FIXED_TEST_NOW_MS));
}

beforeAll(async () => {
  applyFixedTestClock();

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

beforeEach(() => {
  applyFixedTestClock();
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  vi.useRealTimers();
});

export const mockApiBase = `http://127.0.0.1:${PORT}`;

export async function mockControl(body: Record<string, unknown>): Promise<void> {
  await fetch(`${mockApiBase}/__mock/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
