const DEFAULT_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const DEFAULT_MODEL = 'jev-latest';
const MAX_RETRIES = 5;

export const CHOICE_PASS = '通過';
export const CHOICE_FAIL = '不通過';
export const CHOICE_UNABLE = '無法判斷';

const QA_VERDICT_QUESTION = {
  type: 'choice',
  instructions: {
    role: '你是獨立的第三方 QA 審查員。',
    task:
      '根據 state 內的「QA 任務」與「代理人驗收報告」（總判定字句已遮罩為 [VERDICT_MASKED]），判斷此 PR 驗收結果。',
    rules: [
      '僅依報告中的測試結果、發現與證據推理，勿臆測未出現的資訊。',
      '若報告不足以判斷，選「無法判斷」。',
      '任務說明中的 PASS/FAIL 範本文字不是本案例的判定答案。',
    ],
    question: '此案例的 QA 驗收應歸類為哪一項？',
  },
  criteria: {
    [CHOICE_PASS]: '驗收通過：無需阻斷修復的問題，或僅有已接受的低風險項。',
    [CHOICE_FAIL]: '驗收未通過：存在需修復的阻斷或明確未關閉的驗收項。',
    [CHOICE_UNABLE]: '報告缺關鍵證據或互相矛盾，無法可靠判斷。',
  },
};

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {object} opts
 * @param {string} opts.state
 * @param {string} [opts.apiKey]
 * @param {string} [opts.endpoint]
 * @param {typeof fetch} [opts.fetchImpl]
 */
export async function evaluateQaLogForCompare(opts) {
  const apiKey = opts.apiKey ?? process.env.JEV_API_KEY;
  if (!apiKey) {
    throw new Error('JEV_API_KEY is not set');
  }
  const endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const body = {
    model: DEFAULT_MODEL,
    state: opts.state,
    questions: { qa_verdict: QA_VERDICT_QUESTION },
  };

  let lastError = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (res.status === 429 || res.status === 529) {
        const delay = Math.min(32_000, 1000 * 2 ** attempt);
        await sleep(delay);
        continue;
      }
      if (!res.ok) {
        const safe = text.replaceAll(apiKey, '<REDACTED>');
        throw new Error(`jev API ${res.status}: ${safe.slice(0, 400)}`);
      }
      const raw = JSON.parse(text);
      const answer = raw.answers?.qa_verdict;
      if (!answer || answer.type !== 'choice') {
        throw new Error('jev response missing choice answer qa_verdict');
      }
      const choice = answer.choice ?? CHOICE_UNABLE;
      const confidence =
        typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)
          ? answer.confidence
          : 0;
      return {
        choice,
        confidence,
        usage: raw.usage ?? { input_tokens: 0, output_tokens: 0 },
        model: raw.model ?? DEFAULT_MODEL,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1 && /fetch|network|ECONNRESET/i.test(lastError.message)) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }
  }
  throw lastError ?? new Error('jev API retries exhausted');
}
