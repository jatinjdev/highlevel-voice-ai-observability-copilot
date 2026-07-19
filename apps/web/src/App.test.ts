import type { CallAnalysisDetail } from '@copilot/contracts';
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
  activateSuccessCriterion: vi.fn(),
  createSuccessCriterionDraft: vi.fn(),
  retireSuccessCriterion: vi.fn(),
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
  configuration: {
    id: 'c67f2cb3-cec5-4b64-90f1-e9789c9759f2',
    source: 'fixture',
    sourceHash: 'fixture-hash',
    capturedAt: '2026-07-18T00:00:00.000Z',
    configuration: {},
    evidenceCapabilities: {},
  },
  criterionResults: [],
  recommendations: [],
};

describe('DashboardView', () => {
  beforeEach(() => {
    api.initializeMarketplaceSession.mockResolvedValue(undefined);
    api.getObservabilityDashboard.mockResolvedValue({ agents: [] });
    api.getCallAnalysis.mockResolvedValue(emptyRecommendationCall);
  });

  it('renders the voice-agent fleet', async () => {
    const { wrapper } = await mountView('/');
    expect(wrapper.text()).toContain('Voice AI Observability Copilot');
    expect(wrapper.text()).toContain('Agent name');
    expect(wrapper.text()).toContain('Flagged issues');
  });

  it('keeps recommendations visible when none are generated', async () => {
    const { wrapper } = await mountView(
      '/?locationId=test&callId=1bfb4a89-e709-4f65-a5d0-905ff61cbd49',
    );
    expect(wrapper.get('.call-recommendations').text()).toContain('AI recommendations');
    expect(wrapper.get('.call-recommendations').text()).toContain(
      'No prompt changes are recommended',
    );
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
