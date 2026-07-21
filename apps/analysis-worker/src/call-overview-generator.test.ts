import { describe, expect, it } from 'vitest';

import { buildCallOverviewRequest, ModelCallOverviewGenerator } from './call-overview-generator';
import {
  callOverviewSchema,
  type CallEvaluationInput,
  type CriterionEvaluation,
} from './evaluation.types';
import type { StructuredOutputLanguageModel } from './language-model';

const input: CallEvaluationInput = {
  callId: 'call-1',
  agentId: 'agent-1',
  durationSeconds: 20,
  criteria: [{ criterionId: 'criterion-1', description: 'The agent must confirm the order.' }],
  turns: [
    { id: 'turn-1', ordinal: 1, speaker: 'customer', text: 'Please order one cake.' },
    { id: 'turn-2', ordinal: 2, speaker: 'agent', text: 'Done.' },
  ],
  actionEvents: [],
};

const evaluation: CriterionEvaluation = {
  criterionResults: [
    {
      criterionId: 'criterion-1',
      result: 'fail',
      rationale: 'The agent did not confirm the order details.',
      evidenceTurnIds: ['turn-2'],
      evidenceActionIds: [],
    },
  ],
};

describe('call overview generation', () => {
  it('uses the completed checklist without exposing criterion result fields in its schema', () => {
    const request = buildCallOverviewRequest(input, evaluation);

    expect(request.userPrompt).toContain('result=fail');
    expect(request.userPrompt).toContain('The agent did not confirm the order details.');
    expect(request.userPrompt).toContain('[T01] Customer: Please order one cake.');
    expect(request.systemPrompt).toContain('Do not re-evaluate or modify the criterion results.');
    expect(request.schema.keyof().options).toEqual(['intent', 'outcome', 'sentiment']);
  });

  it('returns the independently generated overview', async () => {
    const model = {
      modelId: 'test:model',
      generateObject: () =>
        Promise.resolve({
          intent: 'Order a cake',
          outcome: 'unresolved',
          sentiment: {
            label: 'neutral',
            rationale: 'The caller remained matter-of-fact.',
          },
        }),
    } as unknown as StructuredOutputLanguageModel;

    await expect(
      new ModelCallOverviewGenerator(model).generate(input, evaluation),
    ).resolves.toEqual({
      intent: 'Order a cake',
      outcome: 'unresolved',
      sentiment: {
        label: 'neutral',
        rationale: 'The caller remained matter-of-fact.',
      },
    });
  });

  it('does not reject an otherwise valid overview only because its prose is verbose', () => {
    const intent = 'Ask about cake availability, delivery pricing, and a possible order. '.repeat(
      4,
    );

    expect(
      callOverviewSchema.parse({
        intent,
        outcome: 'partially_resolved',
        sentiment: {
          label: 'neutral',
          rationale: 'The caller remained calm while asking several related questions.',
        },
      }).intent,
    ).toBe(intent);
  });
});
