import { describe, expect, it } from 'vitest';

import { theobromaEvaluationPack } from './theobroma-evaluation-pack';

describe('theobromaEvaluationPack', () => {
  it('contains enough unique calls for agent-level analysis', () => {
    const callIds = theobromaEvaluationPack.calls.map(({ payload }) => payload.id);

    expect(callIds).toHaveLength(20);
    expect(new Set(callIds).size).toBe(callIds.length);
  });

  it('covers the intended range of bakery conversations', () => {
    const scenarioTypes = new Set(
      theobromaEvaluationPack.calls.map(({ fixtureMetadata }) => fixtureMetadata?.scenarioType),
    );

    expect([...scenarioTypes]).toEqual(
      expect.arrayContaining([
        'order',
        'confused_customer',
        'clueless_customer',
        'complaint',
        'wrong_number',
        'security',
        'allergen',
        'abusive_call',
        'transcription_risk',
        'audio_quality',
        'multilingual_confusion',
      ]),
    );
  });

  it('provides labelled conversations for observable call evidence', () => {
    for (const { payload } of theobromaEvaluationPack.calls) {
      expect(payload.transcript).toContain('bot:');
      expect(payload.transcript).toContain('human:');
      expect(payload.duration).toBeGreaterThan(0);
    }
  });

  it('has call and agent ground truth for end-to-end tuning', () => {
    const expectations = theobromaEvaluationPack.expectations;
    expect(expectations).toBeDefined();
    expect(Object.keys(expectations!.calls).sort()).toEqual(
      theobromaEvaluationPack.calls.map(({ payload }) => payload.id).sort(),
    );
    expect(expectations!.agent.minimumFlaggedCalls).toBeGreaterThan(0);
    expect(expectations!.agent.mustRecommendTargets).toEqual(
      expect.arrayContaining(['prompt.core-instructions', 'prompt.fallback-boundaries']),
    );
  });
});
