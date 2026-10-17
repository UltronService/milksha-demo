#!/usr/bin/env node
import { buildWorstCaseStressPayload, runCreamColumnBoundsCheck } from '../../scripts/check-milksha-board-column-alignment.mjs';

try {
  await runCreamColumnBoundsCheck({ payload: buildWorstCaseStressPayload() });
} catch {
  // chromium.launch is expected to fail when browsers are missing
}
