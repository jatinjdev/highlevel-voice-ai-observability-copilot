import type { AgentAnalysisDetail, AgentAnalysisWindow, Recommendation } from '@copilot/contracts';
import { computed, onMounted, onUnmounted, ref } from 'vue';

import {
  analyzeAgent,
  createSuccessCriterion,
  deleteRecommendation,
  deleteSuccessCriterion,
  generateRecommendations,
  getAgentAnalysis,
  getAgentCalls,
} from '../../lib/api';

const AGENT_POLL_INTERVAL_MS = 5_000;
const RECOMMENDATION_POLL_INTERVAL_MS = 1_500;
const RECOMMENDATION_POLL_LIMIT = 60;

export function useAgentAnalysis(agentId: string, notify: (message: string) => void) {
  const agent = ref<AgentAnalysisDetail | null>(null);
  const loading = ref(true);
  const error = ref('');
  const addingCriterion = ref(false);
  const generatingRecommendations = ref(false);
  const loadingMoreCalls = ref(false);
  let statusPollTimer: number | undefined;
  let disposed = false;

  const recommendationGenerationPending = computed(
    () =>
      generatingRecommendations.value ||
      (agent.value?.recommendationStatuses.some(({ status }) =>
        ['queued', 'processing'].includes(status),
      ) ??
        false),
  );

  onMounted(load);
  onUnmounted(() => {
    disposed = true;
    clearStatusPoll();
  });

  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const current = await getAgentAnalysis(agentId);
      if (!disposed) agent.value = current;
    } catch {
      if (!disposed) error.value = "Couldn't load this Voice Agent. Try again.";
    } finally {
      if (!disposed) {
        loading.value = false;
        scheduleStatusPoll();
      }
    }
  }

  function clearStatusPoll(): void {
    if (statusPollTimer !== undefined) window.clearTimeout(statusPollTimer);
    statusPollTimer = undefined;
  }

  function scheduleStatusPoll(): void {
    clearStatusPoll();
    if (!agent.value || disposed) return;
    statusPollTimer = window.setTimeout(async () => {
      try {
        const current = await getAgentAnalysis(agentId);
        if (!disposed) agent.value = current;
      } catch {
        // Keep the last usable projection visible and try again on the next interval.
      } finally {
        if (!disposed) scheduleStatusPoll();
      }
    }, AGENT_POLL_INTERVAL_MS);
  }

  async function addCriterion(name: string, description: string): Promise<boolean> {
    if (!agent.value) return false;
    addingCriterion.value = true;
    error.value = '';
    try {
      const result = await createSuccessCriterion(agentId, name, description);
      if (disposed || !agent.value) return false;
      agent.value.successCriteria.push({
        ...result.criterion,
        resultDistribution: { pass: 0, fail: 0, notApplicable: 0, unknown: 0 },
      });
      return true;
    } catch {
      error.value = "Couldn't add the Success Criterion. Try again.";
      return false;
    } finally {
      addingCriterion.value = false;
    }
  }

  async function loadMoreCalls(): Promise<void> {
    if (!agent.value?.nextCallCursor || loadingMoreCalls.value) return;
    loadingMoreCalls.value = true;
    error.value = '';
    try {
      const page = await getAgentCalls(agentId, agent.value.nextCallCursor);
      if (disposed || !agent.value) return;
      agent.value.calls.push(...page.items);
      agent.value.nextCallCursor = page.nextCursor;
      agent.value.totalCallCount = page.totalCount;
    } catch {
      error.value = "Couldn't load older calls. Try again.";
    } finally {
      loadingMoreCalls.value = false;
    }
  }

  async function removeCriterion(criterionId: string): Promise<boolean> {
    if (!agent.value) return false;
    error.value = '';
    try {
      await deleteSuccessCriterion(agentId, criterionId);
      const current = await getAgentAnalysis(agentId);
      if (!disposed) agent.value = current;
      return true;
    } catch {
      error.value = "Couldn't delete the Success Criterion. Try again.";
      return false;
    }
  }

  async function requestRecommendations(): Promise<void> {
    if (!agent.value) return;
    generatingRecommendations.value = true;
    error.value = '';
    try {
      const result = await generateRecommendations(agentId);
      if (disposed || !agent.value) return;
      const queuedCriterionIds = new Set(result.criterionIds);
      const requestedAt = new Date().toISOString();
      agent.value.recommendationStatuses = [
        ...agent.value.recommendationStatuses.filter(
          ({ criterionId }) => !queuedCriterionIds.has(criterionId),
        ),
        ...result.criterionIds.map((criterionId) => ({
          criterionId,
          status: 'queued' as const,
          lastError: null,
          requestedAt,
        })),
      ];
      if (result.criterionIds.length) void pollRecommendations(result.criterionIds);
    } catch {
      error.value = "Couldn't generate recommendations. Try again.";
    } finally {
      generatingRecommendations.value = false;
    }
  }

  async function pollRecommendations(criterionIds: string[]): Promise<void> {
    const requestedCriteria = new Set(criterionIds);
    for (let attempt = 0; attempt < RECOMMENDATION_POLL_LIMIT; attempt += 1) {
      await delay(RECOMMENDATION_POLL_INTERVAL_MS);
      if (disposed) return;
      let current: AgentAnalysisDetail;
      try {
        current = await getAgentAnalysis(agentId);
      } catch {
        error.value = "Couldn't refresh recommendation progress. Try again.";
        return;
      }
      if (disposed) return;
      agent.value = current;
      const states = current.recommendationStatuses.filter(({ criterionId }) =>
        requestedCriteria.has(criterionId),
      );
      if (
        states.length < requestedCriteria.size ||
        states.some(({ status }) => status === 'queued' || status === 'processing')
      )
        continue;
      const failures = states.filter(({ status }) => status === 'failed');
      if (failures.length) {
        error.value = `${failures.length} ${failures.length === 1 ? 'recommendation' : 'recommendations'} could not be generated.`;
      }
      return;
    }
  }

  async function removeRecommendation(recommendation: Recommendation): Promise<void> {
    if (!agent.value) return;
    error.value = '';
    try {
      await deleteRecommendation(agentId, recommendation.criterionId);
      if (disposed || !agent.value) return;
      agent.value.recommendations = agent.value.recommendations.filter(
        ({ criterionId }) => criterionId !== recommendation.criterionId,
      );
      agent.value.recommendationStatuses = agent.value.recommendationStatuses.filter(
        ({ criterionId }) => criterionId !== recommendation.criterionId,
      );
    } catch {
      error.value = "Couldn't delete the recommendation. Try again.";
    }
  }

  async function runAnalysis(window: AgentAnalysisWindow): Promise<void> {
    error.value = '';
    try {
      const result = await analyzeAgent(agentId, window);
      notify(
        result.queuedCallCount
          ? `${result.queuedCallCount} ${result.queuedCallCount === 1 ? 'call' : 'calls'} added for analysis`
          : 'No calls found in the selected period',
      );
    } catch {
      error.value = "Couldn't analyze calls for the selected period. Try again.";
    }
  }

  return {
    addCriterion,
    addingCriterion,
    agent,
    error,
    generatingRecommendations,
    loading,
    loadingMoreCalls,
    loadMoreCalls,
    recommendationGenerationPending,
    removeCriterion,
    removeRecommendation,
    requestRecommendations,
    runAnalysis,
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
