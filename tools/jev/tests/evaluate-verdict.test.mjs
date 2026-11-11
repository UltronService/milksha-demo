import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateJevChoice,
  computeMatch,
  CONFIDENCE_THRESHOLD,
  CHOICE_UNCLEAR,
} from '../lib/evaluate-verdict.mjs';

describe('evaluateJevChoice', () => {
  it('accepts high-confidence pass', () => {
    const r = evaluateJevChoice({ choice: '通過', confidence: 0.9 });
    assert.equal(r.fallback, false);
    assert.equal(r.jevAnswer, '通過');
  });

  it('fallback on low confidence', () => {
    const r = evaluateJevChoice({ choice: '通過', confidence: CONFIDENCE_THRESHOLD - 0.01 });
    assert.equal(r.fallback, true);
    assert.equal(r.reason, 'low_confidence');
  });

  it('fallback on unclear', () => {
    const r = evaluateJevChoice({ choice: CHOICE_UNCLEAR, confidence: 1 });
    assert.equal(r.fallback, true);
    assert.equal(r.reason, 'unclear_choice');
  });
});

describe('computeMatch', () => {
  it('returns null on fallback', () => {
    assert.equal(computeMatch('通過', '通過', true), null);
  });

  it('matches equal verdicts', () => {
    assert.equal(computeMatch('不通過', '不通過', false), true);
    assert.equal(computeMatch('通過', '不通過', false), false);
  });
});
