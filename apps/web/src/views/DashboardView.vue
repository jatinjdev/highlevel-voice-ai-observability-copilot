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
  createSuccessCriterion,
  deleteRecommendation,
  deleteSuccessCriterion,
  generateRecommendation,
  getAgentAnalysis,
  getAgentCalls,
  getCallAnalysis,
  getObservabilityDashboard,
  initializeMarketplaceSession,
  reanalyzeAgent,
  reanalyzeCall,
  updateSuccessCriterion,
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
const selectedCriterionId = ref<string | null>(null);
const newCriterionName = ref('');
const newCriterionDescription = ref('');
const addingCriterion = ref(false);
const editingCriterionId = ref<string | null>(null);
const editingCriterionDescription = ref('');
const generatingCriterionId = ref<string | null>(null);
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
    if (selectedCriterionId.value && !item.failedCriterionIds.includes(selectedCriterionId.value))
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
  const result = call.value?.criterionResults.find(
    ({ criterionId }) => criterionId === selectedCriterionId.value,
  );
  return new Set(result?.evidence.map(({ turnId }) => turnId) ?? []);
});
const highlightedActionIds = computed(() => {
  const result = call.value?.criterionResults.find(
    ({ criterionId }) => criterionId === selectedCriterionId.value,
  );
  return new Set(result?.actionEvidence.map(({ id }) => id) ?? []);
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
  selectedCriterionId.value = null;
}

async function addCriterion(): Promise<void> {
  if (
    !agent.value ||
    newCriterionName.value.trim().length < 2 ||
    newCriterionDescription.value.trim().length < 10
  )
    return;
  addingCriterion.value = true;
  try {
    await createSuccessCriterion(
      agent.value.agent.id,
      newCriterionName.value.trim(),
      newCriterionDescription.value.trim(),
    );
    newCriterionName.value = '';
    newCriterionDescription.value = '';
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
  await deleteSuccessCriterion(agent.value.agent.id, criterionId);
  selectedCriterionId.value = null;
  await loadRoute();
}

function beginCriterionEdit(criterionId: string, description: string): void {
  editingCriterionId.value = criterionId;
  editingCriterionDescription.value = description;
}

async function saveCriterionEdit(): Promise<void> {
  if (
    !agent.value ||
    !editingCriterionId.value ||
    editingCriterionDescription.value.trim().length < 10
  )
    return;
  await updateSuccessCriterion(
    agent.value.agent.id,
    editingCriterionId.value,
    editingCriterionDescription.value.trim(),
  );
  editingCriterionId.value = null;
  editingCriterionDescription.value = '';
  await loadRoute();
}

async function requestRecommendation(criterionId: string): Promise<void> {
  if (!agent.value) return;
  const agentId = agent.value.agent.id;
  generatingCriterionId.value = criterionId;
  try {
    await generateRecommendation(agentId, criterionId);
    notice.value = 'Recommendation queued';
    await loadRoute();
    void pollRecommendation(agentId, criterionId);
  } finally {
    generatingCriterionId.value = null;
  }
}

async function pollRecommendation(agentId: string, criterionId: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(1_500);
    if (agent.value?.agent.id !== agentId) return;
    let current: AgentAnalysisDetail;
    try {
      current = await getAgentAnalysis(agentId);
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'Prompt guidance status was lost.';
      return;
    }
    if (agent.value?.agent.id !== agentId) return;
    agent.value = current;
    const state = current.recommendationStatuses.find(
      (status) => status.criterionId === criterionId,
    );
    if (!state || state.status === 'queued' || state.status === 'processing') continue;
    if (state.status === 'completed') notice.value = 'Prompt guidance ready';
    else if (state.status === 'not_needed')
      notice.value = 'The current prompt already covers this criterion';
    else error.value = state.lastError ?? 'Prompt guidance could not be generated.';
    return;
  }
  notice.value = 'Prompt guidance is still processing';
}

async function removeRecommendation(recommendation: Recommendation): Promise<void> {
  if (!agent.value) return;
  await deleteRecommendation(agent.value.agent.id, recommendation.criterionId);
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
  await navigator.clipboard.writeText(recommendation.promptAddition);
  notice.value = 'Prompt change copied';
}

async function selectCriterion(
  criterionId: string,
  turnId?: string,
  actionEventId?: string,
): Promise<void> {
  const nextCriterionId = selectedCriterionId.value === criterionId ? null : criterionId;
  selectedCriterionId.value = nextCriterionId;
  if (nextCriterionId) await scrollToEvidence(turnId, actionEventId);
}

function recommendationStatus(criterionId: string): string | null {
  return (
    agent.value?.recommendationStatuses.find((status) => status.criterionId === criterionId)
      ?.status ?? null
  );
}

function hasRecommendation(criterionId: string): boolean {
  return (
    agent.value?.recommendations.some(
      (recommendation) => recommendation.criterionId === criterionId,
    ) ?? false
  );
}

function recommendationButtonLabel(criterionId: string): string {
  const status = recommendationStatus(criterionId);
  if (status === 'queued' || status === 'processing') return 'Checking current prompt…';
  if (status === 'not_needed') return 'Prompt covered · Check again';
  if (status === 'failed') return 'Try prompt guidance again';
  return hasRecommendation(criterionId) ? 'Regenerate prompt guidance' : 'Generate prompt guidance';
}

async function scrollToEvidence(turnId?: string, actionEventId?: string): Promise<void> {
  const selector = turnId
    ? `[data-turn-id="${turnId}"]`
    : actionEventId
      ? `[data-action-id="${actionEventId}"]`
      : null;
  if (!selector) return;
  await nextTick();
  document.querySelector(selector)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
                <p v-if="selectedCriterionId">Filtered by selected criterion</p>
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
              <input v-model="newCriterionName" placeholder="Criterion name" maxlength="96" />
              <textarea
                v-model="newCriterionDescription"
                placeholder="Describe exactly what should happen in a call"
              /><button
                class="primary-button"
                :disabled="
                  addingCriterion ||
                  newCriterionName.trim().length < 2 ||
                  newCriterionDescription.trim().length < 10
                "
              >
                Add
              </button>
            </form>
            <div class="criteria-list internal-scroll">
              <article
                v-for="criterion in agent.successCriteria"
                :key="criterion.id"
                :data-criterion-id="criterion.id"
                :data-selected="selectedCriterionId === criterion.id"
                @click="selectCriterion(criterion.id)"
              >
                <div class="criterion-actions">
                  <button
                    title="Edit criterion"
                    @click.stop="beginCriterionEdit(criterion.id, criterion.description)"
                  >
                    ✎
                  </button>
                  <button title="Delete criterion" @click.stop="removeCriterion(criterion.id)">
                    ×
                  </button>
                </div>
                <strong>{{ criterion.name }}</strong>
                <template v-if="editingCriterionId === criterion.id">
                  <textarea
                    v-model="editingCriterionDescription"
                    class="criterion-edit"
                    @click.stop
                  />
                  <div class="criterion-edit-actions" @click.stop>
                    <button @click="editingCriterionId = null">Cancel</button>
                    <button
                      :disabled="editingCriterionDescription.trim().length < 10"
                      @click="saveCriterionEdit"
                    >
                      Save
                    </button>
                  </div>
                </template>
                <p v-else>{{ criterion.description }}</p>
                <span class="criterion-failures"
                  >{{ criterion.resultDistribution.fail }} failed</span
                >
                <button
                  v-if="criterion.resultDistribution.fail > 0"
                  class="generate-recommendation"
                  :disabled="
                    generatingCriterionId === criterion.id ||
                    ['queued', 'processing'].includes(recommendationStatus(criterion.id) ?? '')
                  "
                  @click.stop="requestRecommendation(criterion.id)"
                >
                  {{ recommendationButtonLabel(criterion.id) }}
                </button>
              </article>
            </div>
          </section>
        </div>
        <RecommendationPanel
          class="agent-recommendations"
          :recommendations="agent.recommendations"
          @copy="copyRecommendation"
          @remove="removeRecommendation"
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
                <p>Failed transcript lines and executed actions highlight when selected</p>
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
              <div v-if="call.call.actionEvents.length" class="call-actions">
                <h3>Executed Call Actions</h3>
                <article
                  v-for="action in call.call.actionEvents"
                  :key="action.id"
                  class="call-action-row"
                  :data-action-id="action.id"
                  :data-highlighted="highlightedActionIds.has(action.id)"
                >
                  <span class="speaker-avatar" data-speaker="action">A</span>
                  <div>
                    <strong>{{ action.actionName || action.actionType || 'Call Action' }}</strong>
                    <p>
                      {{ action.actionType || 'Action' }} ·
                      {{ action.outcome || 'Outcome unknown' }}
                    </p>
                  </div>
                </article>
              </div>
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
                :data-selected="selectedCriterionId === result.criterionId"
                @click="
                  selectCriterion(
                    result.criterionId,
                    result.evidence[0]?.turnId,
                    result.actionEvidence[0]?.id,
                  )
                "
              >
                <strong>{{ result.criterionName }}</strong
                ><span>{{ result.rationale }}</span
                ><small>View evidence</small>
              </button>
            </div>
            <div v-else class="panel-empty">No criteria failed for this call.</div>
          </section>
        </div>
      </template>
    </div>
  </main>
</template>
