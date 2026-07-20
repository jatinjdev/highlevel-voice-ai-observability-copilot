import type { AgentAnalysisDetail, CallAnalysisDetail } from '@copilot/contracts';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import DashboardView from './views/DashboardView.vue';

const api = vi.hoisted(() => ({
  getAgentAnalysis: vi.fn(),
  getAgentCalls: vi.fn(),
  getCallAnalysis: vi.fn(),
  getObservabilityDashboard: vi.fn(),
  initializeMarketplaceSession: vi.fn(),
  reanalyzeAgent: vi.fn(),
  reanalyzeCall: vi.fn(),
  createSuccessCriterion: vi.fn(),
  updateSuccessCriterion: vi.fn(),
  deleteSuccessCriterion: vi.fn(),
  generateRecommendation: vi.fn(),
  deleteRecommendation: vi.fn(),
}));
vi.mock('./lib/api', () => api);

const emptyRecommendationCall: CallAnalysisDetail = {
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
  criterionResults: [],
};

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
    api.initializeMarketplaceSession.mockResolvedValue(undefined);
    api.getObservabilityDashboard.mockResolvedValue({ agents: [] });
    api.getCallAnalysis.mockResolvedValue(emptyRecommendationCall);
    api.getAgentAnalysis.mockResolvedValue(agentAnalysis);
  });

  it('renders the voice-agent fleet', async () => {
    const { wrapper } = await mountView('/');
    expect(wrapper.text()).toContain('Voice AI Observability Copilot');
    expect(wrapper.text()).toContain('Agent name');
    expect(wrapper.text()).toContain('Flagged issues');
  });

  it('keeps the call page focused on checklist evidence', async () => {
    const { wrapper } = await mountView(
      '/?locationId=test&callId=1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
    );
    expect(wrapper.text()).toContain('Flagged issues');
    expect(wrapper.find('.call-recommendations').exists()).toBe(false);
  });

  it('preserves the established agent workspace around the new criteria workflow', async () => {
    const { wrapper } = await mountView(
      '/?locationId=test&agentId=d72b07d3-d8d5-45c4-a7b5-5cc2e47db17c',
    );

    const workspace = wrapper.get('.agent-workspace');
    expect(workspace.find('.calls-panel').exists()).toBe(true);
    expect(workspace.find('.criteria-panel').exists()).toBe(true);
    expect(wrapper.get('.agent-recommendations').text()).toContain('AI recommendations');
    expect(wrapper.get('.agent-recommendations').text()).toContain(
      'Patterns across 8 analyzed calls',
    );
    expect(wrapper.find('button[title="Edit criterion"]').exists()).toBe(false);
    expect(wrapper.get('.generate-recommendation').text()).toContain('Generate prompt guidance');
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
    const issue = wrapper.find('.issue-list button');
    await issue.trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Executed Call Actions');
    expect(wrapper.find('.call-action-row').attributes('data-highlighted')).toBe('true');
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
