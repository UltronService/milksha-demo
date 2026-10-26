#!/usr/bin/env node
import { resolvePreviewPrNumber } from './lib/board-pr-preview-deploy.mjs';

const associated = (process.env.ASSOCIATED_PR_NUMBERS ?? '')
  .split(/[\s,]+/)
  .map((s) => s.trim())
  .filter(Boolean);

const num = resolvePreviewPrNumber({
  associatedPrNumbers: associated,
  headLookupNumber: process.env.HEAD_PR_NUMBER ?? '',
  dispatchInput: process.env.DISPATCH_PR ?? '',
});

if (!num) {
  console.error(
    'resolve-board-pr-preview-pr-number: could not determine PR number (commit pulls, head lookup, or workflow_dispatch input)',
  );
  process.exit(1);
}

console.log(num);
