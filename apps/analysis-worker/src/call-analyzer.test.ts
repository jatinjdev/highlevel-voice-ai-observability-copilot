import { describe, expect, it, vi } from 'vitest';

import { CallAnalyzer } from './call-analyzer';
import type { CallOverviewGenerator } from './call-overview-generator';
import type { CriterionEvaluator } from './criterion-evaluator';
import type { CallEvaluationInput } from './evaluation.types';

const input: CallEvaluationInput = {
  callId: 'call-1',
  agentId: 'agent-1',
  durationSeconds: 20,
  criteria: [{ criterionId: 'criterion-1', description: 'The agent must confirm the order.' }],
  turns: [{ id: 'turn-1', ordinal: 1, speaker: 'customer', text: 'Order one cake.' }],
  actionEvents: [],
};

describe('CallAnalyzer', () => {
  it('generates the overview from the completed criterion evaluation', async () => {
    const evaluation = {
      criterionResults: [
        {
          criterionId: 'criterion-1',
          result: 'fail' as const,
          rationale: 'The order was not confirmed.',
          evidenceTurnIds: ['turn-1'],
          evidenceActionIds: [],
        },
      ],
    };
    const criterionEvaluator: CriterionEvaluator = {
      model: 'model',
      provider: 'provider',
      evaluate: vi.fn().mockResolvedValue(evaluation),
    };
    const callOverviewGenerator: CallOverviewGenerator = {
      generate: vi.fn().mockResolvedValue({
        intent: 'Order a cake',
        outcome: 'unresolved',
        sentiment: { label: 'neutral', rationale: 'The caller was matter-of-fact.' },
      }),
    };

    const result = await new CallAnalyzer(criterionEvaluator, callOverviewGenerator).analyze(input);

    expect(callOverviewGenerator.generate).toHaveBeenCalledWith(input, evaluation);
    expect(result).toEqual({
      ...evaluation,
      overview: {
        intent: 'Order a cake',
        outcome: 'unresolved',
        sentiment: { label: 'neutral', rationale: 'The caller was matter-of-fact.' },
      },
    });
  });
});
