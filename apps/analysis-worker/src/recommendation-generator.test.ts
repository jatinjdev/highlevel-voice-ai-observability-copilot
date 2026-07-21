import { describe, expect, it } from 'vitest';
import { zodResponseFormat } from 'openai/helpers/zod';

import { buildRecommendationRequest } from './recommendation-generator';

describe('recommendation request', () => {
  const baseInput = {
    criterionDescription: 'The agent must not quote prices.',
    currentPrompt: 'Estimate prices and delivery times for every caller.',
    currentConfiguration: {
      raw: {
        agentName: 'Bakery assistant',
        agentPrompt: 'Estimate prices and delivery times for every caller.',
        actions: [],
        voiceId: 'Jessica',
      },
    },
    failures: [
      {
        rationale: 'The agent quoted an unverified price.',
        quotes: ['Agent: The total is 2,400 rupees.'],
        actions: [],
      },
    ],
  };

  it('asks for one evidence-backed change from the documented capability catalogue', () => {
    const request = buildRecommendationRequest({
      ...baseInput,
    });
    expect(request.systemPrompt).toContain('Every Success Criterion is mandatory');
    expect(request.systemPrompt).toContain('prompt.core-instructions');
    expect(request.systemPrompt).toContain('transcription.boosted-keywords');
    expect(request.systemPrompt).toContain('Never diagnose speech-to-text errors from transcript');
    expect(request.systemPrompt).toContain('Never paste an instruction that tells the agent');
    expect(request.systemPrompt).toContain('recording-to-transcript evidence is required');
    expect(request.userPrompt).toContain('<current_prompt>');
    expect(request.userPrompt).toContain('<current_configuration>');
    expect(request.userPrompt).toContain('The agent quoted an unverified price.');
    expect(request.userPrompt).not.toContain('agentPrompt');
  });

  it('supports prompt additions, removals, exact replacements, and configuration-only advice', () => {
    const schema = buildRecommendationRequest(baseInput).schema;

    expect(
      schema.safeParse({
        decision: 'change_required',
        explanation: 'The current prompt directly causes the observed failure.',
        recommendation: null,
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        decision: 'change_required',
        explanation: 'Replace the conflicting pricing instruction.',
        recommendation: {
          changeType: 'prompt',
          capabilityId: 'prompt.core-instructions',
          headline: 'Stop quoting unverified prices',
          advice: 'Replace the conflicting pricing instruction with the safe response below.',
          promptRemovals: ['Estimate prices and delivery times for every caller.'],
          promptAddition:
            'Do not quote a price unless it is returned by an approved pricing source.',
        },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        decision: 'change_required',
        explanation: 'Removing the conflicting instruction fully resolves the criterion.',
        recommendation: {
          changeType: 'prompt',
          capabilityId: 'prompt.core-instructions',
          headline: 'Remove the pricing instruction',
          advice: 'Remove the instruction that causes the agent to estimate prices.',
          promptRemovals: ['Estimate prices and delivery times for every caller.'],
          promptAddition: null,
        },
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        decision: 'change_required',
        explanation: 'The prompt needs a change.',
        recommendation: {
          changeType: 'prompt',
          capabilityId: 'prompt.core-instructions',
          headline: 'Fix the prompt',
          advice: 'Change the prompt.',
          promptRemovals: [],
          promptAddition: null,
        },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        decision: 'change_required',
        explanation: 'A booking action is required for the failed criterion.',
        recommendation: {
          changeType: 'configuration',
          capabilityId: 'action.appointment-booking',
          headline: 'Configure appointment booking',
          advice: 'Connect the calendar callers may book and configure a safe fallback.',
          promptRemovals: [],
          promptAddition: null,
        },
      }).success,
    ).toBe(true);
    expect(() => zodResponseFormat(schema, 'agent_recommendation')).not.toThrow();
  });

  it('rejects invented removal text and prompt patches on non-prompt settings', () => {
    const schema = buildRecommendationRequest(baseInput).schema;
    const recommendation = {
      decision: 'change_required',
      explanation: 'The current prompt conflicts with the criterion.',
      recommendation: {
        changeType: 'prompt',
        capabilityId: 'prompt.core-instructions',
        headline: 'Stop quoting prices',
        advice: 'Replace the conflicting instruction.',
        promptRemovals: ['Quote prices to every caller.'],
        promptAddition: 'Do not quote unverified prices.',
      },
    } as const;

    expect(schema.safeParse(recommendation).success).toBe(false);
    expect(
      schema.safeParse({
        ...recommendation,
        recommendation: {
          ...recommendation.recommendation,
          capabilityId: 'transcription.boosted-keywords',
          promptRemovals: [],
        },
      }).success,
    ).toBe(false);
  });

  it('accepts separate exact removals but rejects a fabricated concatenation', () => {
    const currentPrompt = [
      '- Estimate prices when exact information is unavailable.',
      '- Collect the caller name.',
      '- Make up random prices.',
    ].join('\n');
    const schema = buildRecommendationRequest({ ...baseInput, currentPrompt }).schema;
    const output = {
      decision: 'change_required',
      explanation: 'Two separate instructions conflict with the criterion.',
      recommendation: {
        changeType: 'prompt',
        capabilityId: 'prompt.core-instructions',
        headline: 'Stop quoting invented prices',
        advice: 'Remove both conflicting instructions and use the replacement.',
        promptRemovals: [
          '- Estimate prices when exact information is unavailable.',
          '- Make up random prices.',
        ],
        promptAddition: '- Do not quote prices.',
      },
    } as const;

    expect(schema.safeParse(output).success).toBe(true);
    expect(
      schema.safeParse({
        ...output,
        recommendation: {
          ...output.recommendation,
          promptRemovals: [output.recommendation.promptRemovals.join('\n')],
        },
      }).success,
    ).toBe(false);
  });
});
