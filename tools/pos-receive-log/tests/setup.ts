import '@testing-library/jest-dom/vitest';
import { afterAll, beforeAll } from 'vitest';
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

let listening = false;

beforeAll(async () => {
  if (!listening) {
    await new Promise<void>((resolve) => {
      server.listen(PORT, '127.0.0.1', () => {
        listening = true;
        resolve();
      });
    });
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
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
