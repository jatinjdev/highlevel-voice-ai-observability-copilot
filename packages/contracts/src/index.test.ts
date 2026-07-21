import { describe, expect, it } from 'vitest';

import {
  agentAnalysisRequestResponseSchema,
  agentAnalysisRequestSchema,
  agentAnalysisSummarySchema,
  agentDiscoveryResponseSchema,
  callAnalysisDetailSchema,
  normalizeCriterionName,
  recommendationBatchResponseSchema,
  recommendationSchema,
} from './index';

describe('callAnalysisDetailSchema', () => {
  it('preserves the informational call overview alongside criterion results', () => {
    const result = callAnalysisDetailSchema.safeParse({
      call: {
        id: '1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
        highLevelCallId: 'highlevel-call-1',
        agentId: 'd72b07d3-d8d5-45c4-a7b5-5cc2e47db17c',
        agentName: 'Test Voice Agent',
        createdAt: '2026-07-18T00:00:00.000Z',
        durationSeconds: 42,
        direction: 'inbound',
        sourceSummary: null,
        extractedData: {},
        turns: [],
        actionEvents: [],
      },
      analysisStatus: 'queued',
      analysis: null,
      overview: {
        intent: 'Order a cake',
        outcome: 'unresolved',
        sentiment: {
          label: 'negative',
          rationale: 'The customer expressed frustration about the damaged order.',
        },
      },
      successCriteria: [],
      criterionResults: [],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toHaveProperty('overview.intent', 'Order a cake');
    expect(result.data).toHaveProperty('overview.sentiment.label', 'negative');
  });
});

describe('normalizeCriterionName', () => {
  it('provides one canonical uniqueness key for criterion names', () => {
    expect(normalizeCriterionName('  Confirm   Order DETAILS  ')).toBe('confirm order details');
  });
});

describe('recommendationSchema', () => {
  it('accepts an exact prompt replacement tied to one criterion', () => {
    const result = recommendationSchema.safeParse({
      id: 'b15cbd24-88bb-4fc4-b581-9ea5e86bd870',
      criterionId: 'c11e6d46-8aa8-45ad-a205-a2c7869c33b1',
      criterionName: 'Confirm order details',
      headline: 'Confirm details before completion',
      explanation: 'Recent failed calls ended without confirming the final order.',
      capabilityId: 'prompt.core-instructions',
      capabilityLabel: 'Prompt',
      uiPath: 'Build > Agent prompt',
      advice: 'Replace the conflicting completion instruction with the text below.',
      promptRemovals: ['Complete the order immediately.'],
      promptAddition:
        'Before completing an order, repeat the final items and ask the caller to confirm.',
      affectedCallCount: 5,
      sampledFailureCount: 5,
      generatedAt: '2026-07-20T00:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('accepts manual HighLevel configuration advice without a prompt patch', () => {
    expect(
      recommendationSchema.safeParse({
        id: 'b15cbd24-88bb-4fc4-b581-9ea5e86bd870',
        criterionId: 'c11e6d46-8aa8-45ad-a205-a2c7869c33b1',
        criterionName: 'Book requested appointments',
        headline: 'Configure appointment booking',
        explanation: 'Recent calls could not complete a requested booking.',
        capabilityId: 'action.appointment-booking',
        capabilityLabel: 'Actions',
        uiPath: 'Build > Actions > During the Call > Book Appointment',
        advice: 'Connect the eligible calendar and configure a fallback for unavailable slots.',
        promptRemovals: [],
        promptAddition: null,
        affectedCallCount: 3,
        sampledFailureCount: 3,
        generatedAt: '2026-07-20T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('recommendationBatchResponseSchema', () => {
  it('describes one agent-level request that queues a job per failed criterion', () => {
    const result = recommendationBatchResponseSchema.safeParse({
      batchId: '11990c53-e3b1-44fb-98f4-6e816cf74d71',
      criterionIds: [
        'c11e6d46-8aa8-45ad-a205-a2c7869c33b1',
        'e06954c8-e9d3-46ae-948b-c5782204d75c',
      ],
      queuedCriterionCount: 2,
      status: 'queued',
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

describe('agentDiscoveryResponseSchema', () => {
  it('reports how many HighLevel agents were discovered', () => {
    const result = agentDiscoveryResponseSchema.safeParse({ discoveredAgentCount: 2 });

    expect(result.success).toBe(true);
  });
});

describe('agent analysis contracts', () => {
  it.each(['24h', '7d'])('accepts the supported %s window', (window) => {
    expect(agentAnalysisRequestSchema.safeParse({ window }).success).toBe(true);
  });

  it('rejects unsupported windows', () => {
    expect(agentAnalysisRequestSchema.safeParse({ window: '30d' }).success).toBe(false);
  });

  it('accepts an empty-window response', () => {
    expect(
      agentAnalysisRequestResponseSchema.safeParse({
        requestId: 'a6c4f236-d0bc-4af2-ae76-557b24eb9514',
        window: '24h',
        discoveredCallCount: 0,
        queuedCallCount: 0,
        status: 'no_calls',
      }).success,
    ).toBe(true);
  });
});
