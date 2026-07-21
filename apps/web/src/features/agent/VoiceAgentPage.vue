<script setup lang="ts">
import type { Recommendation } from '@copilot/contracts';
import { computed, ref } from 'vue';

import { useObservabilityNavigation } from '../../app/navigation';
import { formatDate, formatDuration } from '../../shared/formatting';
import AgentCallLog from './AgentCallLog.vue';
import RecommendationPanel from './RecommendationPanel.vue';
import SuccessCriteriaPanel from './SuccessCriteriaPanel.vue';
import { useAgentAnalysis } from './use-agent-analysis';

type CallIssueFilter = 'all' | 'flagged' | 'unflagged';

const props = defineProps<{ agentId: string }>();
const emit = defineEmits<{ notify: [message: string] }>();
const { navigate } = useObservabilityNavigation();
const {
  addCriterion,
  addingCriterion,
  agent,
  error,
  loading,
  loadingMoreCalls,
  loadMoreCalls,
  recommendationGenerationPending,
  removeCriterion,
  removeRecommendation,
  requestRecommendations,
  runAnalysis,
} = useAgentAnalysis(props.agentId, (message) => emit('notify', message));

const callSearch = ref('');
const selectedCriterionId = ref<string | null>(null);
const analysisMenuOpen = ref(false);
const callFilterOpen = ref(false);
const callIssueFilter = ref<CallIssueFilter>('all');

const selectedCriterion = computed(() =>
  agent.value?.successCriteria.find(({ id }) => id === selectedCriterionId.value),
);
const adherence = computed(() => {
  const distribution = (agent.value?.successCriteria ?? []).reduce(
    (total, criterion) => ({
      pass: total.pass + criterion.resultDistribution.pass,
      fail: total.fail + criterion.resultDistribution.fail,
    }),
    { pass: 0, fail: 0 },
  );
  const observable = distribution.pass + distribution.fail;
  return observable ? Math.round((distribution.pass / observable) * 100) : null;
});
const visibleCalls = computed(() => {
  const term = callSearch.value.trim().toLowerCase();
  return (agent.value?.calls ?? []).filter((item) => {
    if (selectedCriterionId.value && !item.failedCriterionIds.includes(selectedCriterionId.value))
      return false;
    if (
      callIssueFilter.value === 'flagged' &&
      (item.analysisStatus !== 'completed' || item.flaggedIssueCount === 0)
    )
      return false;
    if (
      callIssueFilter.value === 'unflagged' &&
      (item.analysisStatus !== 'completed' || item.flaggedIssueCount > 0)
    )
      return false;
    return (
      !term ||
      item.highLevelCallId.toLowerCase().includes(term) ||
      formatDate(item.createdAt).toLowerCase().includes(term)
    );
  });
});
const emptyMessage = computed(() => {
  if (selectedCriterion.value) return 'No calls failed this criterion.';
  if (callIssueFilter.value === 'flagged') return 'No calls have flagged issues.';
  if (callIssueFilter.value === 'unflagged') return 'No calls without flagged issues.';
  if (callSearch.value.trim()) return 'No calls match your search.';
  return 'No calls available.';
});

async function analyze(window: '24h' | '7d'): Promise<void> {
  analysisMenuOpen.value = false;
  await runAnalysis(window);
}

function selectCallIssueFilter(filter: CallIssueFilter): void {
  callIssueFilter.value = filter;
  callFilterOpen.value = false;
  if (filter === 'unflagged') selectedCriterionId.value = null;
}

function selectCriterion(criterionId: string): void {
  selectedCriterionId.value = selectedCriterionId.value === criterionId ? null : criterionId;
}

async function deleteCriterion(criterionId: string): Promise<void> {
  const removed = await removeCriterion(criterionId);
  if (removed) selectedCriterionId.value = null;
}

async function copyRecommendation(recommendation: Recommendation): Promise<void> {
  error.value = '';
  if (!recommendation.promptAddition) return;
  try {
    await navigator.clipboard.writeText(recommendation.promptAddition);
    emit('notify', 'Prompt copied');
  } catch {
    error.value = "Couldn't copy the prompt. Try again.";
  }
}
</script>

<template>
  <div v-if="error" class="error-banner">{{ error }}</div>
  <div v-if="loading" class="loading-panel">Loading Voice Agent…</div>

  <template v-else-if="agent">
    <nav class="breadcrumbs">
      <button @click="navigate({})">Voice Agents</button><span>›</span
      ><strong>{{ agent.agent.name }}</strong>
    </nav>
    <section class="page-heading agent-heading">
      <h1>{{ agent.agent.name }}</h1>
      <div class="agent-heading-controls">
        <div class="agent-analysis-control">
          <button
            class="analyze-button"
            type="button"
            :aria-expanded="analysisMenuOpen"
            @click="analysisMenuOpen = !analysisMenuOpen"
          >
            <svg class="analyze-refresh-icon" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M20 7v5h-5" />
              <path d="M4 17v-5h5" />
              <path d="M18.4 10a7 7 0 0 0-12.2-3.2L4 9" />
              <path d="M5.6 14a7 7 0 0 0 12.2 3.2L20 15" />
            </svg>
            Analyze
            <svg class="analyze-chevron" aria-hidden="true" viewBox="0 0 12 12">
              <path d="m3 4.5 3 3 3-3" />
            </svg>
          </button>
          <div v-if="analysisMenuOpen" class="agent-analysis-menu">
            <button type="button" @click="analyze('24h')">
              <span>Last 24 hours</span><small>Analyze calls</small>
            </button>
            <button type="button" @click="analyze('7d')">
              <span>Last 7 days</span><small>Analyze calls</small>
            </button>
          </div>
        </div>
        <label class="search-field calls-search">
          <span aria-hidden="true">⌕</span>
          <input v-model="callSearch" type="search" placeholder="Search calls..." />
        </label>
        <div class="call-filter-control">
          <button
            class="filter-icon-button"
            type="button"
            aria-label="Filter calls"
            :aria-expanded="callFilterOpen"
            :data-active="callIssueFilter !== 'all'"
            @click="callFilterOpen = !callFilterOpen"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            <span v-if="callIssueFilter !== 'all'" class="filter-active-dot"></span>
          </button>
          <div v-if="callFilterOpen" class="call-filter-menu">
            <button type="button" @click="selectCallIssueFilter('all')">All calls</button>
            <button type="button" @click="selectCallIssueFilter('flagged')">
              Has flagged issues
            </button>
            <button type="button" @click="selectCallIssueFilter('unflagged')">
              No flagged issues
            </button>
          </div>
        </div>
      </div>
    </section>
    <section class="summary-strip">
      <article>
        <span>Calls analyzed</span><strong>{{ agent.summary.callsAnalyzed }}</strong>
      </article>
      <article>
        <span>Average duration</span
        ><strong>{{ formatDuration(agent.summary.averageDurationSeconds) }}</strong>
      </article>
      <article>
        <span>Success-criterion adherence</span
        ><strong>{{ adherence === null ? '—' : `${adherence}%` }}</strong>
      </article>
      <article>
        <span>Calls requiring review</span><strong>{{ agent.summary.callsWithFailures }}</strong>
      </article>
    </section>
    <div class="agent-analysis-layout">
      <div class="agent-review-grid">
        <AgentCallLog
          :calls="visibleCalls"
          :loading-more="loadingMoreCalls"
          :next-cursor="agent.nextCallCursor"
          :selected-criterion-name="selectedCriterion?.name ?? null"
          :total-count="agent.totalCallCount"
          @clear-criterion="selectedCriterionId = null"
          @load-more="loadMoreCalls"
          @open-call="navigate({ callId: $event })"
        >
          <template #empty
            ><div class="empty-panel compact">{{ emptyMessage }}</div></template
          >
        </AgentCallLog>

        <SuccessCriteriaPanel
          :adding="addingCriterion"
          :criteria="agent.successCriteria"
          :create-criterion="addCriterion"
          :selected-criterion-id="selectedCriterionId"
          @remove="deleteCriterion"
          @select="selectCriterion"
        />
      </div>

      <RecommendationPanel
        class="agent-recommendations-panel"
        scope="agent"
        :recommendations="agent.recommendations"
        :analyzed-call-count="agent.summary.callsAnalyzed"
        :generation-pending="recommendationGenerationPending"
        @copy="copyRecommendation"
        @generate="requestRecommendations"
        @remove="removeRecommendation"
      />
    </div>
  </template>
</template>
