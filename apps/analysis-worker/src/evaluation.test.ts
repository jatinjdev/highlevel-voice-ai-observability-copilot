import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { buildCriterionEvaluationRequest, ModelCriterionEvaluator } from './criterion-evaluator';
import type { CallEvaluationInput } from './evaluation.types';
import type { StructuredGenerationRequest, StructuredOutputLanguageModel } from './language-model';

describe('criterion evaluation', () => {
  it('builds a compact request with local aliases and no internal identifiers', () => {
    const built = buildCriterionEvaluationRequest(evaluationInput());

    expect(built.request.schemaName).toBe('voice_call_criterion_evaluation');
    expect(built.request.userPrompt).toContain('[T01] Bot: Hello');
    expect(built.request.userPrompt).toContain('[T02] Human: I need help');
    expect(built.request.userPrompt).toContain('[C01] Customer outcome');
    expect(built.request.userPrompt).not.toContain(CRITERION_VERSION_ID);
    expect(built.request.systemPrompt).toContain('Evaluate every criterion independently');
    expect(built.request.systemPrompt).toContain('Do not infer audio quality');
  });

  it('maps aliases to criterion versions and call-turn ids', async () => {
    const model = new FakeLanguageModel({
      criterionResults: [
        {
          criterionId: 'C01',
          result: 'fail',
          rationale: 'The agent ended without resolving the request.',
          evidenceTurnIds: ['T01', 'T02', 'T02'],
        },
      ],
    });

    const result = await new ModelCriterionEvaluator(model).evaluate(evaluationInput());

    expect(result.criterionResults).toEqual([
      {
        criterionVersionId: CRITERION_VERSION_ID,
        result: 'fail',
        rationale: 'The agent ended without resolving the request.',
        evidenceTurnIds: [AGENT_TURN_ID, CUSTOMER_TURN_ID],
      },
    ]);
  });

  it('downgrades failures without valid transcript evidence to unknown', async () => {
    const model = new FakeLanguageModel({
      criterionResults: [
        {
          criterionId: 'C01',
          result: 'fail',
          rationale: 'Unsupported failure.',
          evidenceTurnIds: ['T99'],
        },
      ],
    });

    const result = await new ModelCriterionEvaluator(model).evaluate(evaluationInput());

    expect(result.criterionResults[0]).toMatchObject({
      criterionVersionId: CRITERION_VERSION_ID,
      result: 'unknown',
    });
  });
});

const CRITERION_VERSION_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_TURN_ID = '55555555-5555-4555-8555-555555555555';
const CUSTOMER_TURN_ID = '66666666-6666-4666-8666-666666666666';

export function evaluationInput(): CallEvaluationInput {
  return {
    callId: '22222222-2222-4222-8222-222222222222',
    agentId: '33333333-3333-4333-8333-333333333333',
    durationSeconds: 30,
    configuration: { agentPrompt: 'Resolve support questions.' },
    criteria: [
      {
        criterionId: '44444444-4444-4444-8444-444444444444',
        criterionVersionId: CRITERION_VERSION_ID,
        stableKey: 'universal.customer_outcome',
        title: 'Customer outcome',
        origin: 'universal',
        criterionClass: 'outcome',
        naturalLanguageRule: 'Resolve the customer request or establish an honest next step.',
        applicabilityDefinition: { appliesWhen: 'Every substantive call.' },
        evaluationInstructions: 'Use supplied evidence only.',
        requiredEvidence: ['quoted transcript evidence'],
        allowedRecommendationTargetIds: ['prompt.core-instructions'],
      },
    ],
    turns: [
      { id: AGENT_TURN_ID, ordinal: 1, speaker: 'agent', text: 'Hello' },
      { id: CUSTOMER_TURN_ID, ordinal: 2, speaker: 'customer', text: 'I need help' },
    ],
    actionEvents: [],
  };
}

class FakeLanguageModel implements StructuredOutputLanguageModel {
  readonly modelId = 'fake:test-model';

  constructor(private readonly output: unknown) {}

  generateObject<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.output<TSchema>> {
    return Promise.resolve(request.schema.parse(this.output));
  }
}
