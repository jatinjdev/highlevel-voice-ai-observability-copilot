import { describe, expect, it } from 'vitest';

import { buildRecommendationRequest } from './recommendation-generator';

describe('recommendation request', () => {
  it('asks for paste-ready prompt text only after checking current coverage', () => {
    const request = buildRecommendationRequest({
      criterionDescription: 'The agent must confirm the final order.',
      currentPrompt: 'Take bakery orders politely.',
      failures: [{ rationale: 'Order completed without confirmation.', quotes: ['Bot: Done.'] }],
    });
    expect(request.systemPrompt).toContain(
      'If the prompt already clearly addresses the concern, return covered.',
    );
    expect(request.systemPrompt).toContain(
      'promptAddition must itself be the new agent instruction',
    );
    expect(request.userPrompt).toContain('<current_prompt>');
    expect(request.userPrompt).toContain('Order completed without confirmation.');
  });

  it('keeps prompt coverage and recommendation presence consistent', () => {
    const schema = buildRecommendationRequest({
      criterionDescription: 'The agent must confirm the final order.',
      currentPrompt: 'Take bakery orders politely.',
      failures: [{ rationale: 'Order completed without confirmation.', quotes: ['Bot: Done.'] }],
    }).schema;

    expect(
      schema.safeParse({
        promptCoverage: 'missing',
        explanation: 'Confirmation guidance is absent.',
        recommendation: null,
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        promptCoverage: 'covered',
        explanation: 'The prompt already requires confirmation.',
        recommendation: {
          headline: 'Confirm orders',
          promptAddition: 'Confirm every order before submission.',
        },
      }).success,
    ).toBe(false);
  });
});
