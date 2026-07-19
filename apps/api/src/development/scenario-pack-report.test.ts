import { describe, expect, it } from 'vitest';

import type { EvaluationScenarioPack } from './scenario-pack-seeder';
import { compareScenarioPackResults } from './scenario-pack-report';

const pack: EvaluationScenarioPack = {
  version: 'test-v1',
  agent: { highLevelAgentId: 'agent-1', name: 'Test Agent', prompt: 'Be helpful.' },
  expectations: {
    calls: {
      'call-clean': {
        outcome: 'success',
        mustFlagCriterionKeys: [],
        mustRecommendTargets: [],
        mustNotRecommendTargets: ['prompt.core-instructions'],
      },
      'call-failed': {
        outcome: 'failure',
        mustFlagCriterionKeys: ['orders.confirm'],
        mustRecommendTargets: ['prompt.core-instructions'],
        mustRecommendForCriterionKeys: ['orders.confirm'],
      },
    },
    agent: {
      minimumFlaggedCalls: 1,
      repeatedCriterionKeys: [],
      mustRecommendTargets: ['prompt.core-instructions'],
    },
  },
  calls: [],
};

describe('compareScenarioPackResults', () => {
  it('reports a passing call and agent-level evaluation', () => {
    const report = compareScenarioPackResults(pack, {
      calls: [
        {
          callId: 'call-clean',
          runStatus: 'completed',
          outcome: 'success',
          flaggedCriterionKeys: [],
          recommendationTargets: [],
          recommendationCriterionKeys: [],
        },
        {
          callId: 'call-failed',
          runStatus: 'completed',
          outcome: 'failure',
          flaggedCriterionKeys: ['orders.confirm'],
          recommendationTargets: ['prompt.core-instructions'],
          recommendationCriterionKeys: ['orders.confirm'],
        },
      ],
      agentRecommendationTargets: ['prompt.core-instructions'],
    });

    expect(report.passed).toBe(true);
    expect(report.calls.every(({ passed }) => passed)).toBe(true);
  });

  it('makes missing flags and recommendations explicit', () => {
    const report = compareScenarioPackResults(pack, {
      calls: [
        {
          callId: 'call-clean',
          runStatus: 'completed',
          outcome: 'success',
          flaggedCriterionKeys: [],
          recommendationTargets: [],
          recommendationCriterionKeys: [],
        },
        {
          callId: 'call-failed',
          runStatus: 'failed',
          outcome: null,
          flaggedCriterionKeys: [],
          recommendationTargets: [],
          recommendationCriterionKeys: [],
        },
      ],
      agentRecommendationTargets: [],
    });

    expect(report.passed).toBe(false);
    expect(report.calls.find(({ callId }) => callId === 'call-failed')?.mismatches).toEqual([
      'analysis run was failed; expected completed',
      'outcome was missing; expected failure',
      'orders.confirm was not flagged',
      'prompt.core-instructions recommendation was missing',
      'orders.confirm had no linked recommendation',
    ]);
    expect(report.agent.mismatches).toContain(
      'prompt.core-instructions aggregate recommendation was missing',
    );
  });
});
