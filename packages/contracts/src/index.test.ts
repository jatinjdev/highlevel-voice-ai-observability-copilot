import { describe, expect, it } from 'vitest';

import {
  agentAnalysisSummarySchema,
  agentReanalysisRequestSchema,
  agentReanalysisResponseSchema,
  pasteReadyRecommendationChange,
  pipelineSummarySchema,
} from './index';

describe('pasteReadyRecommendationChange', () => {
  it('turns meta-level prompt advice into a paste-ready instruction', () => {
    expect(
      pasteReadyRecommendationChange({
        type: 'prompt',
        proposedChange:
          'Explicitly instruct the Voice Agent to say it cannot confirm an order change without verification, and to offer a concrete follow-up.',
      }),
    ).toBe(
      'Say you cannot confirm an order change without verification, and offer a concrete follow-up.',
    );

    expect(
      pasteReadyRecommendationChange({
        type: 'prompt',
        proposedChange:
          'Add a core instruction for order handling: when the caller corrects an item, discard the old item before continuing.',
      }),
    ).toBe('When the caller corrects an item, discard the old item before continuing.');
  });

  it('leaves direct prompt text unchanged', () => {
    expect(
      pasteReadyRecommendationChange({
        type: 'prompt',
        proposedChange: 'Confirm the delivery address before placing the order.',
      }),
    ).toBe('Confirm the delivery address before placing the order.');
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
