import { describe, expect, it } from 'vitest';

import {
  agentAnalysisSummarySchema,
  agentReanalysisRequestSchema,
  agentReanalysisResponseSchema,
  normalizeCriterionName,
  pipelineSummarySchema,
  recommendationSchema,
} from './index';

describe('normalizeCriterionName', () => {
  it('provides one canonical uniqueness key for criterion names', () => {
    expect(normalizeCriterionName('  Confirm   Order DETAILS  ')).toBe('confirm order details');
  });
});

describe('recommendationSchema', () => {
  it('requires paste-ready agent guidance tied to one criterion', () => {
    const result = recommendationSchema.safeParse({
      id: 'b15cbd24-88bb-4fc4-b581-9ea5e86bd870',
      criterionId: 'c11e6d46-8aa8-45ad-a205-a2c7869c33b1',
      criterionName: 'Confirm order details',
      headline: 'Confirm details before completion',
      explanation: 'Recent failed calls ended without confirming the final order.',
      promptAddition:
        'Before completing an order, repeat the final items and ask the caller to confirm.',
      affectedCallCount: 5,
      sampledFailureCount: 5,
      generatedAt: '2026-07-20T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });
});

describe('agentAnalysisSummarySchema', () => {
  it('accepts categorical aggregates without an overall quality score', () => {
    const result = agentAnalysisSummarySchema.safeParse({
      callsAnalyzed: 1,
      averageDurationSeconds: 42,
      flaggedIssueCount: 1,
      callsWithFailures: 1,
    });

    expect(result.success).toBe(true);
  });
});

describe('pipelineSummarySchema', () => {
  it('accepts an explicitly labelled deterministic-analysis pipeline', () => {
    const result = pipelineSummarySchema.safeParse({
      agentsMonitored: 1,
      callsIngested: 1,
      analysesCompleted: 1,
      analysisMode: 'deterministic',
      lastSyncedAt: '2026-07-14T00:00:00.000Z',
      calls: [],
    });

    expect(result.success).toBe(true);
  });
});

describe('agent reanalysis contracts', () => {
  it.each(['24h', '7d'])('accepts the supported %s window', (window) => {
    expect(agentReanalysisRequestSchema.safeParse({ window }).success).toBe(true);
  });

  it('rejects unsupported windows', () => {
    expect(agentReanalysisRequestSchema.safeParse({ window: '30d' }).success).toBe(false);
  });

  it('accepts an empty-window response', () => {
    expect(
      agentReanalysisResponseSchema.safeParse({
        batchRequestId: 'a6c4f236-d0bc-4af2-ae76-557b24eb9514',
        window: '24h',
        matchedCallCount: 0,
        queuedCallCount: 0,
        status: 'no_calls',
      }).success,
    ).toBe(true);
  });
});
