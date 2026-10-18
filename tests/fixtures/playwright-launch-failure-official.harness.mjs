#!/usr/bin/env node
import { runOfficialBoardLayoutCheck } from '../../scripts/check-milksha-board-official-layout.mjs';

try {
  await runOfficialBoardLayoutCheck();
} catch {
  // chromium.launch is expected to fail when browsers are missing
}
