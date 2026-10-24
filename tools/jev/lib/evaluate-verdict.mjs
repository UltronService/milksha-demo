export const CONFIDENCE_THRESHOLD = 0.85;

export const CHOICE_PASS = '通過';
export const CHOICE_FAIL = '不通過';
export const CHOICE_UNCLEAR = '看不出來';

/**
 * @param {{ choice?: string, confidence?: number }} answer
 * @returns {{ jevAnswer: string, confidence: number, fallback: boolean, reason: string }}
 */
export function evaluateJevChoice(answer) {
  const jevAnswer = answer?.choice ?? CHOICE_UNCLEAR;
  const confidence =
    typeof answer?.confidence === 'number' && Number.isFinite(answer.confidence)
      ? answer.confidence
      : 0;

  if (jevAnswer === CHOICE_UNCLEAR) {
    return {
      jevAnswer,
      confidence,
      fallback: true,
      reason: 'unclear_choice',
    };
  }
  if (confidence < CONFIDENCE_THRESHOLD) {
    return {
      jevAnswer,
      confidence,
      fallback: true,
      reason: 'low_confidence',
    };
  }
  return {
    jevAnswer,
    confidence,
    fallback: false,
    reason: 'accepted',
  };
}

/**
 * @param {string} qaVerdict
 * @param {string} jevAnswer
 * @param {boolean} fallback
 * @returns {boolean | null} null when fallback (no match score)
 */
export function computeMatch(qaVerdict, jevAnswer, fallback) {
  if (fallback) {
    return null;
  }
  return qaVerdict === jevAnswer;
}
