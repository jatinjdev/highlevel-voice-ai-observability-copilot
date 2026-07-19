import { describe, expect, it, vi } from 'vitest';

import { CallAnalyzer } from './call-analyzer';
import type { CriterionEvaluator } from './criterion-evaluator';
import { evaluationInput } from './evaluation.test';
import { RecommendationPlanner } from './recommendation-planner';

describe('CallAnalyzer', () => {
  it('evaluates criteria then derives recommendations from failed results', async () => {
    const input = evaluationInput();
    const evaluation = {
      criterionResults: [
        {
          criterionVersionId: input.criteria[0]!.criterionVersionId,
          result: 'fail' as const,
          rationale: 'The request was not resolved.',
          evidenceTurnIds: [input.turns[0]!.id],
        },
      ],
    };
    const evaluator: CriterionEvaluator = {
      provider: 'test-provider',
      model: 'test-model',
      evaluate: vi.fn().mockResolvedValue(evaluation),
    };
    const analyzer = new CallAnalyzer(new RecommendationPlanner(), evaluator);

    const result = await analyzer.analyze(input);

    expect(result.evaluation).toBe(evaluation);
    expect(result.recommendations[0]).toMatchObject({
      criterionVersionId: input.criteria[0]!.criterionVersionId,
      type: 'prompt',
      targetId: 'prompt.core-instructions',
    });
    expect(analyzer.runtime).toEqual({ provider: 'test-provider', model: 'test-model' });
  });
});
