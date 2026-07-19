<script setup lang="ts">
import type {
  AgentAnalysisDetail,
  CallAnalysisDetail,
  Recommendation,
  ObservabilityDashboard,
} from '@copilot/contracts';
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import RecommendationPanel from '../components/RecommendationPanel.vue';
import {
  activateSuccessCriterion,
  createSuccessCriterionDraft,
  getAgentAnalysis,
  getAgentCalls,
  getCallAnalysis,
  getObservabilityDashboard,
  initializeMarketplaceSession,
  reanalyzeAgent,
  reanalyzeCall,
  retireSuccessCriterion,
} from '../lib/api';

const route = useRoute();
const router = useRouter();
const dashboard = ref<ObservabilityDashboard | null>(null);
const agent = ref<AgentAnalysisDetail | null>(null);
const call = ref<CallAnalysisDetail | null>(null);
const loading = ref(true);
const error = ref('');
const notice = ref('');
const search = ref('');
const callSearch = ref('');
const selectedCriterionVersionId = ref<string | null>(null);
const selectedRecommendationId = ref<string | null>(null);
const newCriterion = ref('');
const addingCriterion = ref(false);
const loadingMoreCalls = ref(false);
const reanalysisMenuOpen = ref(false);

const view = computed(() => (call.value ? 'call' : agent.value ? 'agent' : 'dashboard'));
const filteredAgents = computed(() => {
  const term = search.value.trim().toLowerCase();
  return (dashboard.value?.agents ?? []).filter(({ name }) => name.toLowerCase().includes(term));
});
const visibleCalls = computed(() => {
  const term = callSearch.value.trim().toLowerCase();
  return (agent.value?.calls ?? []).filter((item) => {
    if (
      selectedCriterionVersionId.value &&
      !item.failedCriterionVersionIds.includes(selectedCriterionVersionId.value)
    )
      return false;
    return (
      !term ||
      item.highLevelCallId.toLowerCase().includes(term) ||
      formatDate(item.createdAt).toLowerCase().includes(term)
    );
  });
});
const failedResults = computed(
  () => call.value?.criterionResults.filter(({ result }) => result === 'fail') ?? [],
);
const highlightedTurnIds = computed(() => {
  const selectedRecommendation = call.value?.recommendations.find(
    ({ id }) => id === selectedRecommendationId.value,
  );
  if (selectedRecommendation) return new Set(selectedRecommendation.evidenceTurnIds);
  const result = call.value?.criterionResults.find(
    ({ criterionVersionId }) => criterionVersionId === selectedCriterionVersionId.value,
  );
  return new Set(result?.evidence.map(({ turnId }) => turnId) ?? []);
});

onMounted(loadRoute);
watch(
  () => route.fullPath,
  (current, previous) => {
    if (current !== previous) void loadRoute();
  },
);

async function loadRoute(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    await initializeMarketplaceSession();
    const callId = stringQuery(route.query.callId);
    const agentId = stringQuery(route.query.agentId);
    if (callId) {
      call.value = await getCallAnalysis(callId);
      agent.value = null;
      dashboard.value = null;
    } else if (agentId) {
      agent.value = await getAgentAnalysis(agentId);
      call.value = null;
      dashboard.value = null;
    } else {
      dashboard.value = await getObservabilityDashboard();
      agent.value = null;
      call.value = null;
    }
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : 'The observability view could not be loaded.';
  } finally {
    loading.value = false;
  }
}

async function navigate(query: Record<string, string>): Promise<void> {
  const locationId = stringQuery(route.query.locationId);
  await router.push({ path: '/', query: { ...(locationId ? { locationId } : {}), ...query } });
  selectedCriterionVersionId.value = null;
  selectedRecommendationId.value = null;
}

async function addCriterion(): Promise<void> {
  if (!agent.value || newCriterion.value.trim().length < 10) return;
  addingCriterion.value = true;
  try {
    const draft = await createSuccessCriterionDraft(
      agent.value.agent.id,
      newCriterion.value.trim(),
    );
    await activateSuccessCriterion(agent.value.agent.id, draft.criterion.id);
    newCriterion.value = '';
    await loadRoute();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The criterion could not be added.';
  } finally {
    addingCriterion.value = false;
  }
}

async function loadMoreCalls(): Promise<void> {
  if (!agent.value?.nextCallCursor || loadingMoreCalls.value) return;
  loadingMoreCalls.value = true;
  try {
    const page = await getAgentCalls(agent.value.agent.id, agent.value.nextCallCursor);
    agent.value.calls.push(...page.items);
    agent.value.nextCallCursor = page.nextCursor;
    agent.value.totalCallCount = page.totalCount;
  } finally {
    loadingMoreCalls.value = false;
  }
}

async function removeCriterion(criterionId: string): Promise<void> {
  if (!agent.value) return;
  await retireSuccessCriterion(agent.value.agent.id, criterionId);
  selectedCriterionVersionId.value = null;
  await loadRoute();
}

async function runCallAnalysis(): Promise<void> {
  if (!call.value) return;
  const result = await reanalyzeCall(call.value.call.id);
  notice.value = `Analysis queued · ${result.requestId.slice(0, 8)}`;
}

async function runAgentAnalysis(window: '24h' | '7d'): Promise<void> {
  if (!agent.value) return;
  reanalysisMenuOpen.value = false;
  const result = await reanalyzeAgent(agent.value.agent.id, window);
  notice.value = result.queuedCallCount
    ? `${result.queuedCallCount} calls queued for analysis`
    : 'No calls found in that window';
}

async function copyRecommendation(recommendation: Recommendation): Promise<void> {
  await navigator.clipboard.writeText(recommendation.proposedChange);
  notice.value = 'Prompt change copied';
}

async function selectCallEvidence(recommendation: Recommendation): Promise<void> {
  selectedRecommendationId.value = recommendation.id;
  selectedCriterionVersionId.value = recommendation.criterionVersionId;
  await scrollToEvidence(recommendation.evidenceTurnIds[0]);
}

async function selectCriterion(criterionVersionId: string, turnId?: string): Promise<void> {
  selectedRecommendationId.value = null;
  selectedCriterionVersionId.value =
    selectedCriterionVersionId.value === criterionVersionId ? null : criterionVersionId;
  await scrollToEvidence(turnId);
}

async function scrollToEvidence(turnId?: string): Promise<void> {
  if (!turnId) return;
  await nextTick();
  document
    .querySelector(`[data-turn-id="${turnId}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function stringQuery(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}
</script>

<template>
  <main class="app-shell" :data-view="view">
    <div v-if="notice" class="toast" @animationend="notice = ''">{{ notice }}</div>
    <div class="page-shell">
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-if="loading" class="loading-panel">Loading voice agent analysis…</div>

      <template v-else-if="dashboard">
        <header class="page-heading dashboard-heading">
          <div><h1>Voice AI Observability Copilot</h1></div>
          <label class="search-field">
            <span>⌕</span><input v-model="search" placeholder="Search voice agents" />
          </label>
        </header>
        <section class="data-panel fleet-panel">
          <div class="table-scroll">
            <table class="data-table fleet-table">
              <thead>
                <tr>
                  <th>Agent name</th>
                  <th>Calls analyzed</th>
                  <th>Avg. duration</th>
                  <th>Flagged issues</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in filteredAgents"
                  :key="item.id"
                  @click="navigate({ agentId: item.id })"
                >
                  <td>
                    <div class="agent-cell">
                      <span class="agent-icon">AI</span><strong>{{ item.name }}</strong>
                    </div>
                  </td>
                  <td>{{ item.summary.callsAnalyzed }}</td>
                  <td>{{ formatDuration(item.summary.averageDurationSeconds) }}</td>
                  <td>
                    <span class="issue-count" :data-active="item.summary.flaggedIssueCount > 0">{{
                      item.summary.flaggedIssueCount
                    }}</span>
                  </td>
                  <td class="row-chevron">›</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>

      <template v-else-if="agent">
        <nav class="breadcrumbs">
          <button @click="navigate({})">Voice Agents</button><span>›</span
          ><strong>{{ agent.agent.name }}</strong>
        </nav>
        <header class="page-heading agent-heading">
          <h1>{{ agent.agent.name }}</h1>
          <div class="reanalysis-control">
            <button class="secondary-button" @click="reanalysisMenuOpen = !reanalysisMenuOpen">
              ↻ Analyze calls ▾
            </button>
            <div v-if="reanalysisMenuOpen" class="action-menu">
              <button @click="runAgentAnalysis('24h')">Last 24 hours</button>
              <button @click="runAgentAnalysis('7d')">Last 7 days</button>
            </div>
          </div>
        </header>
        <section class="summary-strip summary-strip-three">
          <article>
            <span>Calls analyzed</span><strong>{{ agent.summary.callsAnalyzed }}</strong>
          </article>
          <article>
            <span>Average duration</span
            ><strong>{{ formatDuration(agent.summary.averageDurationSeconds) }}</strong>
          </article>
          <article>
            <span>Flagged issues</span><strong>{{ agent.summary.flaggedIssueCount }}</strong>
          </article>
        </section>
        <div class="agent-workspace">
          <section class="data-panel calls-panel">
            <header class="compact-panel-header">
              <div>
                <h2>Call log</h2>
                <p v-if="selectedCriterionVersionId">Filtered by selected criterion</p>
              </div>
              <label class="mini-search"
                ><input v-model="callSearch" placeholder="Search calls"
              /></label>
            </header>
            <div class="internal-scroll">
              <table class="data-table calls-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Duration</th>
                    <th>Flagged issues</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in visibleCalls"
                    :key="item.id"
                    @click="navigate({ callId: item.id })"
                  >
                    <td>
                      <time>{{ formatDate(item.createdAt) }}</time>
                    </td>
                    <td>{{ formatDuration(item.durationSeconds) }}</td>
                    <td>
                      <span class="issue-count" :data-active="item.flaggedIssueCount > 0">{{
                        item.flaggedIssueCount
                      }}</span>
                    </td>
                    <td class="row-chevron">›</td>
                  </tr>
                </tbody>
              </table>
              <button
                v-if="agent.nextCallCursor"
                class="load-more-button"
                :disabled="loadingMoreCalls"
                @click="loadMoreCalls"
              >
                {{ loadingMoreCalls ? 'Loading…' : 'Load more calls' }}
              </button>
            </div>
          </section>
          <section class="data-panel criteria-panel">
            <header class="compact-panel-header">
              <div>
                <h2>Success Criteria</h2>
                <p>Click a criterion to filter calls</p>
              </div>
            </header>
            <form class="criterion-form" @submit.prevent="addCriterion">
              <textarea
                v-model="newCriterion"
                placeholder="Add a success criterion in plain language"
              /><button
                class="primary-button"
                :disabled="addingCriterion || newCriterion.trim().length < 10"
              >
                Add
              </button>
            </form>
            <div class="criteria-list internal-scroll">
              <article
                v-for="criterion in agent.successCriteria"
                :key="criterion.id"
                :data-selected="selectedCriterionVersionId === criterion.versionId"
                @click="selectCriterion(criterion.versionId)"
              >
                <button
                  class="delete-button"
                  title="Delete criterion"
                  @click.stop="removeCriterion(criterion.id)"
                >
                  ×
                </button>
                <strong>{{ criterion.title }}</strong>
                <p>{{ criterion.naturalLanguageRule }}</p>
                <span class="criterion-failures"
                  >{{ criterion.resultDistribution.fail }} failed</span
                >
              </article>
            </div>
          </section>
        </div>
        <RecommendationPanel
          class="agent-recommendations"
          scope="agent"
          :recommendations="agent.recommendations"
          :analyzed-call-count="agent.summary.callsAnalyzed"
          @copy="copyRecommendation"
          @select="() => undefined"
        />
      </template>

      <template v-else-if="call">
        <nav class="breadcrumbs">
          <button @click="navigate({})">Voice Agents</button><span>›</span
          ><button @click="navigate({ agentId: call.call.agentId })">
            {{ call.call.agentName }}</button
          ><span>›</span><strong>{{ formatDate(call.call.createdAt) }}</strong>
        </nav>
        <header class="page-heading call-heading">
          <h1>Call analysis</h1>
          <div class="call-facts">
            <span>Duration: {{ formatDuration(call.call.durationSeconds) }}</span
            ><span class="flagged-label">Flagged issues: {{ failedResults.length }}</span
            ><button class="secondary-button" @click="runCallAnalysis">↻ Analyze again</button>
          </div>
        </header>
        <div class="call-workspace">
          <section class="data-panel transcript-panel">
            <header class="compact-panel-header">
              <div>
                <h2>Transcript</h2>
                <p>Failed lines are highlighted when you select an issue</p>
              </div>
            </header>
            <div class="transcript internal-scroll">
              <article
                v-for="turn in call.call.turns"
                :key="turn.id"
                :data-turn-id="turn.id"
                :data-highlighted="highlightedTurnIds.has(turn.id)"
              >
                <span class="speaker-avatar" :data-speaker="turn.speaker">{{
                  turn.speaker === 'agent' ? 'AI' : 'C'
                }}</span>
                <div>
                  <strong>{{ turn.speaker === 'agent' ? call.call.agentName : 'Customer' }}</strong>
                  <p>{{ turn.text }}</p>
                </div>
              </article>
            </div>
          </section>
          <section class="data-panel issue-panel">
            <header class="compact-panel-header">
              <div>
                <h2>Flagged issues</h2>
                <p>{{ failedResults.length }} criteria failed</p>
              </div>
            </header>
            <div v-if="failedResults.length" class="issue-list internal-scroll">
              <button
                v-for="result in failedResults"
                :key="result.id"
                :data-selected="selectedCriterionVersionId === result.criterionVersionId"
                @click="selectCriterion(result.criterionVersionId, result.evidence[0]?.turnId)"
              >
                <strong>{{ result.title }}</strong
                ><span>{{ result.rationale }}</span
                ><small>View evidence</small>
              </button>
            </div>
            <div v-else class="panel-empty">No criteria failed for this call.</div>
          </section>
        </div>
        <RecommendationPanel
          class="call-recommendations"
          scope="call"
          :recommendations="call.recommendations"
          :selected-recommendation-id="selectedRecommendationId"
          @copy="copyRecommendation"
          @select="selectCallEvidence"
        />
      </template>
    </div>
  </main>
</template>
