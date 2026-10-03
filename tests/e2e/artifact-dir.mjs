import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** @returns {string} */
export function e2eArtifactsDir() {
  const dir = process.env.MILKSHA_E2E_ARTIFACTS || join(tmpdir(), 'milksha-e2e-artifacts');
  mkdirSync(dir, { recursive: true });
  return dir;
}
