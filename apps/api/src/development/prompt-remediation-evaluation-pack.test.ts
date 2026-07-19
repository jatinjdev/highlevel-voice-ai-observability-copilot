import { describe, expect, it } from 'vitest';

import {
  PROMPT_REMEDIATION_AGENT_NAME,
  promptRemediationEvaluationPack,
} from './prompt-remediation-evaluation-pack';

describe('promptRemediationEvaluationPack', () => {
  it('defines an incomplete prompt and a balanced prompt-remediation corpus', () => {
    expect(PROMPT_REMEDIATION_AGENT_NAME).toBe('Evaluation Agent · Prompt Remediation');
    expect(promptRemediationEvaluationPack.agent.prompt).toBe(
      'You are the phone assistant for Theobroma Bakery, Bandra West. Help callers with product questions, orders, pickup, delivery, and complaints. Be friendly, concise, and helpful.',
    );
    expect(promptRemediationEvaluationPack.agent.userDefinedCriteria).toHaveLength(7);
    expect(promptRemediationEvaluationPack.calls).toHaveLength(8);

    const expectations = promptRemediationEvaluationPack.expectations!;
    const callIds = promptRemediationEvaluationPack.calls.map(({ payload }) => payload.id);
    expect(Object.keys(expectations.calls).sort()).toEqual(callIds.sort());
    expect(
      Object.values(expectations.calls).filter(
        ({ mustFlagCriterionKeys }) => mustFlagCriterionKeys.length === 0,
      ),
    ).toHaveLength(2);
    expect(
      Object.values(expectations.calls).filter(
        ({ mustFlagCriterionKeys }) => mustFlagCriterionKeys.length > 0,
      ),
    ).toHaveLength(6);
    expect(expectations.agent.minimumFlaggedCalls).toBe(6);
    expect(expectations.agent.minimumRecommendations).toBe(5);
    expect(expectations.agent.mustRecommendTargetPrefixes).toEqual(['prompt.']);
  });
});
