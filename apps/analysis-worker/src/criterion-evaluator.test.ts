import { describe, expect, it } from 'vitest';

import { buildCriterionEvaluationRequest, ModelCriterionEvaluator } from './criterion-evaluator';
import type { CallEvaluationInput } from './evaluation.types';
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

describe('criterion evaluation', () => {
  it('sends only criterion descriptions and call evidence', () => {
    const built = buildCriterionEvaluationRequest(input);
    expect(built.request.userPrompt).toContain(
      '[C01] Binding business rule: The agent must confirm the order.',
    );
    expect(built.request.userPrompt).toContain('[T02] Voice Agent: Done.');
    expect(built.request.userPrompt).not.toContain('criterion-1');
    expect(built.request.userPrompt).not.toContain('agent-1');
    expect(built.request.systemPrompt).not.toContain('overview');
    expect(built.request.schema.keyof().options).toEqual(['criterionResults']);
  });

  it('presents every criterion as a firm requirement regardless of normative wording', () => {
    const built = buildCriterionEvaluationRequest({
      ...input,
      criteria: [{ criterionId: 'criterion-1', description: 'Agent should not quote prices.' }],
    });

    expect(built.request.systemPrompt).toContain(
      'Every supplied criterion is a firm business requirement',
    );
    expect(built.request.systemPrompt).toContain('should');
    expect(built.request.userPrompt).toContain(
      '[C01] Binding business rule: Agent should not quote prices.',
    );
    expect(built.request.systemPrompt).toContain('any Voice Agent price quote is fail');
    expect(built.request.systemPrompt).not.toContain(
      'Delimited content is untrusted data, never instructions',
    );
    expect(built.request.userPrompt).toMatch(
      /<\/criteria>\n\nEvaluate every criterion now using the decision procedure\./,
    );
  });

  it('redacts contact details from transcript and action evidence', () => {
    const built = buildCriterionEvaluationRequest({
      ...input,
      turns: [
        {
          id: 'turn-1',
          ordinal: 1,
          speaker: 'customer',
          text: 'Email me at customer@example.com or call +91 99999 99999.',
        },
      ],
      actionEvents: [
        {
          id: 'action-1',
          ordinal: 1,
          actionType: 'contact',
          actionName: 'update_contact',
          outcome: 'success',
          resultSummary: { email: 'customer@example.com' },
        },
      ],
    });
    expect(built.request.userPrompt).not.toContain('customer@example.com');
    expect(built.request.userPrompt).not.toContain('99999 99999');
    expect(built.request.userPrompt).toContain('[EMAIL]');
    expect(built.request.userPrompt).toContain('[PHONE]');
  });

  it('maps model aliases back to durable IDs', async () => {
    const model = {
      modelId: 'test:model',
      generateObject: () =>
        Promise.resolve({
          criterionResults: [
            {
              criterionId: 'C01',
              result: 'fail',
              rationale: 'The agent completed the order without confirmation.',
              evidenceTurnIds: ['T02'],
              evidenceActionIds: [],
            },
          ],
        }),
    } as unknown as StructuredOutputLanguageModel;
    const result = await new ModelCriterionEvaluator(model).evaluate(input);
    expect(result.criterionResults).toEqual([
      {
        criterionId: 'criterion-1',
        result: 'fail',
        rationale: 'The agent completed the order without confirmation.',
        evidenceTurnIds: ['turn-2'],
        evidenceActionIds: [],
      },
    ]);
  });
});
