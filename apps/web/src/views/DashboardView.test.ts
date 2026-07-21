import type { AgentAnalysisDetail, CallAnalysisDetail } from '@copilot/contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardView from './DashboardView.vue';

const api = vi.hoisted(() => ({
  analyzeAgent: vi.fn(),
  analyzeCall: vi.fn(),
  discoverVoiceAgents: vi.fn(),
  getAgentAnalysis: vi.fn(),
  getAgentCalls: vi.fn(),
  getCallAnalysis: vi.fn(),
  getObservabilityDashboard: vi.fn(),
  initializeMarketplaceSession: vi.fn(),
  createSuccessCriterion: vi.fn(),
  deleteSuccessCriterion: vi.fn(),
  generateRecommendations: vi.fn(),
  deleteRecommendation: vi.fn(),
}));
vi.mock('../lib/api', () => api);

const emptyRecommendationCall = {
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
  analysisStatus: 'completed',
  analysis: {
    id: '560aa596-f285-43d6-a8cd-b6f3e25c0a93',
    runSequence: 1,
    runReason: 'manual',
    status: 'completed',
    model: 'test-model',
    provider: 'test-provider',
    evaluatorVersion: 'test-v1',
    completedAt: '2026-07-18T00:00:01.000Z',
  },
  overview: {
    intent: 'Report a damaged birthday cake',
    outcome: 'unresolved',
    sentiment: {
      label: 'negative',
      rationale: 'The customer became frustrated after the agent refused to help.',
    },
  },
  successCriteria: [],
  criterionResults: [],
} as unknown as CallAnalysisDetail;

const agentAnalysis: AgentAnalysisDetail = {
  agent: {
    id: 'd72b07d3-d8d5-45c4-a7b5-5cc2e47db17c',
    name: 'Test Voice Agent',
    lifecycleState: 'active',
  },
  summary: {
    callsAnalyzed: 8,
    averageDurationSeconds: 72,
    flaggedIssueCount: 4,
    callsWithFailures: 3,
  },
  configuration: null,
  successCriteria: [
    {
      id: 'e06954c8-e9d3-46ae-948b-c5782204d75c',
      name: 'Confirm before completion',
      description: 'Confirm every material request before completing it.',
      source: 'user',
      resultDistribution: { pass: 4, fail: 2, notApplicable: 2, unknown: 0 },
    },
  ],
  recommendations: [],
  recommendationStatuses: [],
  calls: [],
  nextCallCursor: null,
  totalCallCount: 0,
};

describe('DashboardView', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.initializeMarketplaceSession.mockResolvedValue(undefined);
    api.discoverVoiceAgents.mockResolvedValue({ discoveredAgentCount: 0 });
    api.analyzeCall.mockResolvedValue({
      requestId: '73bd5ee7-5518-44f2-887a-a174723580c2',
      status: 'queued',
    });
    api.analyzeAgent.mockResolvedValue({
      requestId: '7d9fd1c7-2108-449a-b5b4-b04db547b3bb',
      status: 'queued',
      discoveredCallCount: 3,
      queuedCallCount: 2,
    });
    api.getObservabilityDashboard.mockResolvedValue({ agents: [] });
    api.getCallAnalysis.mockResolvedValue(emptyRecommendationCall);
    api.getAgentAnalysis.mockResolvedValue(agentAnalysis);
    api.generateRecommendations.mockResolvedValue({
      batchId: '11990c53-e3b1-44fb-98f4-6e816cf74d71',
      criterionIds: [agentAnalysis.successCriteria[0]!.id],
      queuedCriterionCount: 1,
      status: 'queued',
    });
  });

  it('renders the voice-agent fleet', async () => {
    api.getObservabilityDashboard.mockResolvedValue({
      agents: [
        {
          id: agentAnalysis.agent.id,
          name: agentAnalysis.agent.name,
          lifecycleState: 'active',
          analysisStatus: 'completed',
          summary: agentAnalysis.summary,
        },
      ],
    });
    const { wrapper } = await mountView('/');
    expect(wrapper.text()).toContain('Voice AI Observability Copilot');
    expect(wrapper.text()).toContain(
      'Review agent performance and open the calls that need a decision.',
    );
    expect(wrapper.text()).toContain('Agent name');
    expect(wrapper.text()).toContain('Flagged Issues');
    expect(wrapper.get('input[type="search"]').attributes('placeholder')).toBe(
      'Search agents by name…',
    );
    expect(api.discoverVoiceAgents).toHaveBeenCalledOnce();
    expect(wrapper.text()).not.toContain('No open insight');
  });

  it('keeps the call page focused on checklist evidence', async () => {
    const { wrapper } = await mountView(
      '/?locationId=test&callId=1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
    );
    expect(wrapper.text()).toContain('Flagged issues');
    expect(wrapper.get("[data-review='clear']").text()).toContain('Flagged issues: 0');
    expect(wrapper.find('.call-recommendations').exists()).toBe(false);
  });

  it('does not expose the internal request ID when call analysis is queued', async () => {
    const { wrapper } = await mountView(
      '/?locationId=test&callId=1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
    );
    vi.useFakeTimers();

    try {
      await wrapper.get('.call-header-badges button').trigger('click');
      await flushPromises();

      expect(api.analyzeCall).toHaveBeenCalledWith(emptyRecommendationCall.call.id);
      expect(wrapper.get('.toast').text()).toBe('Call added for analysis');
      expect(wrapper.get('.call-header-badges button').text()).toBe('Queued');
      expect(wrapper.get('.call-header-badges button').attributes('disabled')).toBeDefined();
      expect(wrapper.text()).not.toContain('73bd5ee7');

      await vi.advanceTimersByTimeAsync(4_000);
      await flushPromises();

      expect(wrapper.find('.toast').exists()).toBe(false);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('keeps polling and shows processing while an analysis is retryable', async () => {
    const { wrapper } = await mountView(
      '/?locationId=test&callId=1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
    );
    vi.useFakeTimers();

    try {
      await wrapper.get('.call-header-badges button').trigger('click');
      await flushPromises();
      api.getCallAnalysis.mockResolvedValue({
        ...emptyRecommendationCall,
        analysisStatus: 'processing',
        overview: null,
        criterionResults: [],
      });

      await vi.advanceTimersByTimeAsync(2_000);
      await flushPromises();

      expect(wrapper.get('.call-header-badges button').text()).toBe('Processing…');
      expect(wrapper.get('.call-analysis-notice span').text()).toBe('Analyzing this call.');
      expect(wrapper.get('.call-analysis-notice').text()).not.toContain('transcript');

      await vi.advanceTimersByTimeAsync(4_000);
      await flushPromises();

      expect(wrapper.get('.call-header-badges button').text()).toBe('Processing…');
      expect(api.getCallAnalysis.mock.calls.length).toBeGreaterThanOrEqual(3);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('keeps a queued call transcript visible while analysis-only sections are pending', async () => {
    api.getCallAnalysis.mockResolvedValue({
      ...emptyRecommendationCall,
      call: {
        ...emptyRecommendationCall.call,
        turns: [
          {
            id: 'b39c6876-50bc-4287-ae39-d83c12dd9c56',
            ordinal: 1,
            speaker: 'customer',
            text: 'I need help with a damaged order.',
            sourceStartMs: null,
            sourceEndMs: null,
          },
        ],
      },
      analysisStatus: 'queued',
      analysis: null,
      overview: null,
      successCriteria: [
        {
          id: 'e06954c8-e9d3-46ae-948b-c5782204d75c',
          name: 'Customer outcome',
          description: 'Resolve the request or establish a clear next step.',
          source: 'default',
        },
      ],
      criterionResults: [],
    } as unknown as CallAnalysisDetail);

    const { wrapper } = await mountView(
      '/?locationId=test&callId=1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
    );

    expect(wrapper.get('.reference-transcript-list').text()).toContain(
      'I need help with a damaged order.',
    );
    expect(wrapper.find('.reference-speaker-icon .customer-user-icon').exists()).toBe(true);
    expect(wrapper.get('.reference-speaker-icon').text()).not.toContain('CU');
    expect(wrapper.get('.call-analysis-notice span').text()).toBe('Analysis will start shortly.');
    expect(wrapper.get('.call-analysis-notice').text()).not.toContain('transcript');
    expect(wrapper.get('.call-summary-reference p').text()).toBe(
      'Summary will appear after analysis.',
    );
    expect(wrapper.get('.checklist-reference').text()).toContain('Customer outcome');
    expect(wrapper.get('.checklist-reference').text()).toContain('Pending evaluation');
    expect(wrapper.get("[data-review='pending']").text()).toContain('Flagged issues: 0');
    expect(wrapper.get('.checklist-reference').text()).not.toContain(
      'Success Criteria results will appear when analysis completes.',
    );
  });

  it('shows a function-specific error instead of exposing an API status', async () => {
    api.analyzeCall.mockRejectedValue(new Error('Analysis request failed with status 500.'));
    const { wrapper } = await mountView(
      '/?locationId=test&callId=1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
    );

    await wrapper.get('.call-header-badges button').trigger('click');
    await flushPromises();

    expect(wrapper.get('.error-banner').text()).toBe("Couldn't start analysis. Try again.");
    expect(wrapper.text()).not.toContain('status 500');
  });

  it('distinguishes an empty fleet from a search with no matches', async () => {
    api.getObservabilityDashboard.mockResolvedValue({
      agents: [
        {
          id: agentAnalysis.agent.id,
          name: agentAnalysis.agent.name,
          lifecycleState: 'active',
          analysisStatus: 'completed',
          summary: agentAnalysis.summary,
        },
      ],
    });
    const { wrapper } = await mountView('/');

    await wrapper.get('input[type="search"]').setValue('missing agent');

    expect(wrapper.get('.empty-panel').text()).toBe('No Voice Agents match your search.');
  });

  it('describes an empty flagged-issues filter instead of blaming search', async () => {
    const { wrapper } = await mountView(
      '/?locationId=test&agentId=d72b07d3-d8d5-45c4-a7b5-5cc2e47db17c',
    );

    await wrapper.get('.filter-icon-button').trigger('click');
    const flaggedFilter = wrapper
      .findAll('.call-filter-menu button')
      .find((button) => button.text().includes('Has flagged issues'));
    await flaggedFilter!.trigger('click');

    expect(wrapper.get('.calls-panel .empty-panel').text()).toBe('No calls have flagged issues.');
  });

  it('shows call context and highlights the cited transcript text', async () => {
    api.getCallAnalysis.mockResolvedValue({
      ...emptyRecommendationCall,
      call: {
        ...emptyRecommendationCall.call,
        sourceSummary: 'The customer reported a damaged birthday cake.',
        turns: [
          {
            id: 'b39c6876-50bc-4287-ae39-d83c12dd9c56',
            ordinal: 1,
            speaker: 'agent',
            text: 'You probably handled the box badly after delivery.',
            sourceStartMs: 12_000,
            sourceEndMs: 16_000,
          },
        ],
      },
      criterionResults: [
        {
          id: '2e495829-8710-448d-bdb1-3fa843581a48',
          criterionId: 'e06954c8-e9d3-46ae-948b-c5782204d75c',
          criterionName: 'Safe and trustworthy behavior',
          criterionDescription: 'The Voice Agent must avoid unsupported blame.',
          result: 'fail',
          rationale: 'The agent blamed the customer without evidence.',
          evidence: [
            {
              turnId: 'b39c6876-50bc-4287-ae39-d83c12dd9c56',
              turnOrdinal: 1,
              speaker: 'agent',
              text: 'You probably handled the box badly after delivery.',
            },
          ],
          actionEvidence: [],
        },
      ],
    } satisfies CallAnalysisDetail);

    const { wrapper } = await mountView(
      '/?locationId=test&callId=1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
    );

    expect(wrapper.get('.call-transcript-reference h1').text()).toBe('Transcript Forensic View');
    expect(wrapper.get('.call-summary-reference').text()).toContain('damaged birthday cake');
    expect(wrapper.get('.call-summary-reference').text()).toContain(
      'Report a damaged birthday cake',
    );
    expect(wrapper.get('.call-summary-reference').text()).toContain('Unresolved');
    expect(wrapper.get('.call-sentiment-reference').text()).toContain('Negative');
    expect(wrapper.get('.call-sentiment-reference').text()).toContain(
      'The customer became frustrated after the agent refused to help.',
    );
    expect(wrapper.text()).not.toContain('Not classified');
    expect(wrapper.text()).not.toContain('Not assessed');
    expect(wrapper.text()).not.toContain('Sentiment is not part of the criteria-only');
    expect(wrapper.get('.checklist-reference').text()).toContain('Safe and trustworthy behavior');
    expect(wrapper.find('.call-reference-rail').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('00:12');

    await wrapper.get('.checklist-reference button').trigger('click');
    await flushPromises();

    expect(wrapper.get('.evidence-highlight').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('.evidence-highlight').text()).toBe(
      'You probably handled the box badly after delivery.',
    );
    expect(wrapper.get('.reference-turn-callout').text()).toContain(
      'Safe and trustworthy behavior',
    );
  });

  it('preserves the established agent workspace around the new criteria workflow', async () => {
    const { wrapper } = await mountView(
      '/?locationId=test&agentId=d72b07d3-d8d5-45c4-a7b5-5cc2e47db17c',
    );

    const workspace = wrapper.get('.agent-analysis-layout');
    expect(workspace.find('.agent-review-grid .calls-panel').exists()).toBe(true);
    expect(workspace.find('.agent-review-grid .criteria-panel').exists()).toBe(true);
    expect(wrapper.get('.summary-strip').findAll('article')).toHaveLength(4);
    expect(wrapper.find('.filter-icon-button').exists()).toBe(true);
    expect(wrapper.get('.agent-recommendations-panel').text()).toContain('AI recommendations');
    expect(wrapper.get('.agent-recommendations-panel').text()).toContain(
      'Aggregated from 8 analyzed calls',
    );
    expect(wrapper.find('button[title="Edit criterion"]').exists()).toBe(false);
    expect(wrapper.find('.criterion-guidance-button').exists()).toBe(false);
    expect(wrapper.get('.recommendation-generate-button').text()).toBe('Generate');

    await wrapper.get('.criterion-filter-button').trigger('click');
    expect(wrapper.get('.active-criterion-filter-label').text()).toBe('Confirm before completion');
    expect(wrapper.find('.active-criterion-filter-dismiss').exists()).toBe(true);

    await wrapper.get('.active-criterion-filter').trigger('click');
    expect(wrapper.find('.active-criterion-filter').exists()).toBe(false);
  });

  it('queues recommendations without replacing the workspace or showing a progress toast', async () => {
    api.getAgentAnalysis
      .mockResolvedValueOnce(agentAnalysis)
      .mockImplementationOnce(() => new Promise<AgentAnalysisDetail>(() => undefined));
    const { wrapper } = await mountView(
      '/?locationId=test&agentId=d72b07d3-d8d5-45c4-a7b5-5cc2e47db17c',
    );
    vi.useFakeTimers();

    try {
      await wrapper.get('.recommendation-generate-button').trigger('click');
      await flushPromises();

      expect(api.generateRecommendations).toHaveBeenCalledOnce();
      expect(api.generateRecommendations).toHaveBeenCalledWith(agentAnalysis.agent.id);
      expect(wrapper.find('.toast').exists()).toBe(false);
      expect(wrapper.get('.recommendation-generate-button').text()).toBe('Generating…');
      expect(wrapper.find('.loading-panel').exists()).toBe(false);
      expect(wrapper.find('.agent-analysis-layout').exists()).toBe(true);
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('adds a criterion without replacing the agent workspace', async () => {
    const createdCriterion = {
      id: '2695e21c-a8fc-4dac-a832-05ac9af6462f',
      name: 'Confirm delivery address',
      description: 'Confirm the delivery address before finalizing an order.',
      source: 'user' as const,
    };
    api.createSuccessCriterion.mockResolvedValue({
      criterion: createdCriterion,
    });
    api.getAgentAnalysis
      .mockResolvedValueOnce(agentAnalysis)
      .mockImplementationOnce(() => new Promise<AgentAnalysisDetail>(() => undefined));
    const { wrapper } = await mountView(
      '/?locationId=test&agentId=d72b07d3-d8d5-45c4-a7b5-5cc2e47db17c',
    );

    await wrapper.get('.criterion-add-toggle').trigger('click');
    await wrapper.get('.criterion-composer input').setValue(createdCriterion.name);
    await wrapper.get('.criterion-composer textarea').setValue(createdCriterion.description);
    await wrapper.get('.criterion-composer').trigger('submit');
    await flushPromises();

    expect(api.createSuccessCriterion).toHaveBeenCalledWith(
      agentAnalysis.agent.id,
      createdCriterion.name,
      createdCriterion.description,
    );
    expect(wrapper.find('.loading-panel').exists()).toBe(false);
    expect(wrapper.find('.agent-analysis-layout').exists()).toBe(true);
    expect(wrapper.text()).toContain(createdCriterion.name);
  });

  it('keeps the agent workspace visible while refreshing after criterion deletion', async () => {
    let resolveRefresh!: (value: AgentAnalysisDetail) => void;
    api.getAgentAnalysis.mockResolvedValueOnce(agentAnalysis).mockImplementationOnce(
      () =>
        new Promise<AgentAnalysisDetail>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const { wrapper } = await mountView(
      '/?locationId=test&agentId=d72b07d3-d8d5-45c4-a7b5-5cc2e47db17c',
    );

    await wrapper.get('button[aria-label="Delete criterion"]').trigger('click');
    await flushPromises();

    expect(api.deleteSuccessCriterion).toHaveBeenCalledWith(
      agentAnalysis.agent.id,
      agentAnalysis.successCriteria[0]!.id,
    );
    expect(wrapper.find('.loading-panel').exists()).toBe(false);
    expect(wrapper.find('.agent-analysis-layout').exists()).toBe(true);

    resolveRefresh({ ...agentAnalysis, successCriteria: [] });
    await flushPromises();
  });

  it('removes a recommendation without reloading the agent workspace', async () => {
    const item = {
      id: '128f89a8-8e43-45cc-a6d0-b03d471bf8e3',
      criterionId: agentAnalysis.successCriteria[0]!.id,
      criterionName: agentAnalysis.successCriteria[0]!.name,
      headline: 'Confirm the request',
      explanation: 'The agent skipped confirmation.',
      capabilityId: 'prompt.core-instructions',
      capabilityLabel: 'Prompt',
      uiPath: 'Build > Agent prompt',
      advice: 'Use the exact instruction below.',
      promptRemovals: [],
      promptAddition: 'Confirm the request before completing it.',
      affectedCallCount: 2,
      sampledFailureCount: 2,
      generatedAt: '2026-07-20T00:00:00.000Z',
    };
    api.getAgentAnalysis
      .mockResolvedValueOnce({ ...agentAnalysis, recommendations: [item] })
      .mockImplementationOnce(() => new Promise<AgentAnalysisDetail>(() => undefined));
    const { wrapper } = await mountView(
      '/?locationId=test&agentId=d72b07d3-d8d5-45c4-a7b5-5cc2e47db17c',
    );

    await wrapper.get('button[aria-label="Delete recommendation"]').trigger('click');
    await flushPromises();

    expect(api.deleteRecommendation).toHaveBeenCalledWith(agentAnalysis.agent.id, item.criterionId);
    expect(wrapper.find('.loading-panel').exists()).toBe(false);
    expect(wrapper.find('.agent-analysis-layout').exists()).toBe(true);
  });

  it('highlights an executed Call Action cited by a failed criterion', async () => {
    api.getCallAnalysis.mockResolvedValue({
      ...emptyRecommendationCall,
      call: {
        ...emptyRecommendationCall.call,
        actionEvents: [
          {
            id: '57c18411-c05f-46ad-8ec7-b74dd6862efd',
            ordinal: 1,
            actionType: 'appointment',
            actionName: 'Book appointment',
            outcome: 'failed',
            resultSummary: {},
          },
        ],
      },
      criterionResults: [
        {
          id: '2e495829-8710-448d-bdb1-3fa843581a48',
          criterionId: 'e06954c8-e9d3-46ae-948b-c5782204d75c',
          criterionName: 'Complete booking',
          criterionDescription: 'The Voice Agent must complete an appointment booking.',
          result: 'fail',
          rationale: 'The supplied booking action failed.',
          evidence: [],
          actionEvidence: [
            {
              id: '57c18411-c05f-46ad-8ec7-b74dd6862efd',
              ordinal: 1,
              actionName: 'Book appointment',
              outcome: 'failed',
            },
          ],
        },
      ],
    } satisfies CallAnalysisDetail);

    const { wrapper } = await mountView(
      '/?locationId=test&callId=1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
    );
    const issue = wrapper.find('.checklist-reference button');
    await issue.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Executed Call Actions');
    expect(wrapper.find('.reference-action-row').attributes('data-highlighted')).toBe('true');
  });
});

async function mountView(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: DashboardView }],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(DashboardView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}
