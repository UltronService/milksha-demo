import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateQaLogState } from '../lib/jev-client.mjs';

describe('evaluateQaLogState', () => {
  it('parses choice response', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'jev-1.13.0',
          answers: {
            qa_verdict: {
              type: 'choice',
              choice: '通過',
              confidence: 0.95,
              probabilities: { 通過: 0.95, 不通過: 0.05, 看不出來: 0 },
            },
          },
          usage: { input_tokens: 100, output_tokens: 10 },
        }),
    });

    const result = await evaluateQaLogState({
      state: 'sample',
      apiKey: 'test-key',
      fetchImpl,
    });
    assert.equal(result.answer.choice, '通過');
    assert.equal(result.usage.input_tokens, 100);
  });

  it('retries on 429', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: false, status: 429, text: async () => 'rate limited' };
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            model: 'jev-1.13.0',
            answers: {
              qa_verdict: {
                type: 'choice',
                choice: '看不出來',
                confidence: 0.5,
                probabilities: {},
              },
            },
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
      };
    };

    const result = await evaluateQaLogState({
      state: 'x',
      apiKey: 'k',
      fetchImpl,
    });
    assert.equal(calls, 2);
    assert.equal(result.answer.choice, '看不出來');
  });

  it('throws on 401 without leaking key', async () => {
    const secret = 'super-secret-key-value-12345';
    const fetchImpl = async () => ({
      ok: false,
      status: 401,
      text: async () => `invalid key ${secret}`,
    });

    await assert.rejects(
      () => evaluateQaLogState({ state: 'x', apiKey: secret, fetchImpl }),
      (err) => {
        assert.match(String(err), /401/);
        assert.doesNotMatch(String(err), /super-secret-key/);
        return true;
      },
    );
  });
});
