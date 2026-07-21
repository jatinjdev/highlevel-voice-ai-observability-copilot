<script setup lang="ts">
import type {
  AgentAnalysisDetail,
  CallAnalysisDetail,
  Recommendation,
  ObservabilityDashboard,
} from '@copilot/contracts';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import RecommendationPanel from '../components/RecommendationPanel.vue';
import {
  analyzeAgent,
  analyzeCall,
  createSuccessCriterion,
  deleteRecommendation,
  deleteSuccessCriterion,
  discoverVoiceAgents,
  generateRecommendations,
  getAgentAnalysis,
  getAgentCalls,
  getCallAnalysis,
  getObservabilityDashboard,
  initializeMarketplaceSession,
} from '../lib/api';

interface TurnAnnotation {
  key: string;
  criterionId: string;
  title: string;
  explanation: string;
  turnId: string;
  turnOrdinal: number;
  text: string;
}

interface TurnSegment {
  text: string;
  annotationKey: string | null;
}

type CallIssueFilter = 'all' | 'flagged' | 'unflagged';

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
const generatingRecommendations = ref(false);
const loadingMoreCalls = ref(false);
const analysisMenuOpen = ref(false);
const callFilterOpen = ref(false);
const callIssueFilter = ref<CallIssueFilter>('all');
const criterionComposerOpen = ref(false);
const selectedAnnotationKey = ref<string | null>(null);
const callSidebarOpen = ref(false);
let statusPollTimer: number | undefined;
let noticeTimer: number | undefined;
const NOTICE_DURATION_MS = 4_000;

const view = computed(() => (call.value ? 'call' : agent.value ? 'agent' : 'dashboard'));
const loadingMessage = computed(() => {
  if (stringQuery(route.query.callId)) return 'Loading call analysis…';
  if (stringQuery(route.query.agentId)) return 'Loading Voice Agent…';
  return 'Loading Voice Agents…';
});
const filteredAgents = computed(() => {
  const term = search.value.trim().toLowerCase();
  return (dashboard.value?.agents ?? []).filter(({ name }) => name.toLowerCase().includes(term));
});
const dashboardEmptyMessage = computed(() =>
  search.value.trim() ? 'No Voice Agents match your search.' : 'No Voice Agents found.',
);
const selectedCriterion = computed(() =>
  agent.value?.successCriteria.find(({ id }) => id === selectedCriterionId.value),
);
const agentAdherence = computed(() => {
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
const callLogEmptyMessage = computed(() => {
  if (selectedCriterion.value) return 'No calls failed this criterion.';
  if (callIssueFilter.value === 'flagged') return 'No calls have flagged issues.';
  if (callIssueFilter.value === 'unflagged') return 'No calls without flagged issues.';
  if (callSearch.value.trim()) return 'No calls match your search.';
  return 'No calls available.';
});
const failedResults = computed(
  () => call.value?.criterionResults.filter(({ result }) => result === 'fail') ?? [],
);
const callAnalysisPending = computed(
  () => call.value?.analysisStatus === 'queued' || call.value?.analysisStatus === 'processing',
);
const recommendationGenerationPending = computed(
  () =>
    generatingRecommendations.value ||
    (agent.value?.recommendationStatuses.some(({ status }) =>
      ['queued', 'processing'].includes(status),
    ) ??
      false),
);
const prioritizedCriterionResults = computed(() => {
  const order = { fail: 0, unknown: 1, pass: 2, not_applicable: 3 } as const;
  return [...(call.value?.criterionResults ?? [])].sort(
    (left, right) => order[left.result] - order[right.result],
  );
});
const turnAnnotations = computed(() => {
  const annotations = new Map<string, TurnAnnotation[]>();
  for (const result of call.value?.criterionResults ?? []) {
    if (result.result !== 'fail') continue;
    for (const evidence of result.evidence) {
      const annotation: TurnAnnotation = {
        key: `criterion:${result.id}:${evidence.turnId}`,
        criterionId: result.criterionId,
        title: result.criterionName,
        explanation: result.rationale,
        turnId: evidence.turnId,
        turnOrdinal: evidence.turnOrdinal,
        text: evidence.text,
      };
      annotations.set(evidence.turnId, [...(annotations.get(evidence.turnId) ?? []), annotation]);
    }
  }
  return annotations;
});
const highlightedActionIds = computed(() => {
  const result = call.value?.criterionResults.find(
    ({ criterionId }) => criterionId === selectedCriterionId.value,
  );
  return new Set(result?.actionEvidence.map(({ id }) => id) ?? []);
});

onMounted(loadRoute);
onUnmounted(() => {
  clearStatusPoll();
  clearNoticeTimer();
});
watch(
  () => route.fullPath,
  (current, previous) => {
    if (current !== previous) void loadRoute();
  },
);

async function loadRoute(): Promise<void> {
  clearStatusPoll();
  loading.value = true;
  error.value = '';
  const callId = stringQuery(route.query.callId);
  const agentId = stringQuery(route.query.agentId);
  try {
    await initializeMarketplaceSession();
    if (callId) {
      call.value = await getCallAnalysis(callId);
      selectedAnnotationKey.value = null;
      callSidebarOpen.value = false;
      agent.value = null;
      dashboard.value = null;
    } else if (agentId) {
      agent.value = await getAgentAnalysis(agentId);
      call.value = null;
      dashboard.value = null;
    } else {
      let discoveryFailed = false;
      try {
        await discoverVoiceAgents();
      } catch {
        discoveryFailed = true;
      }
      dashboard.value = await getObservabilityDashboard();
      if (discoveryFailed)
        showNotice("Voice Agents couldn't be refreshed. Showing the last available list.");
      agent.value = null;
      call.value = null;
    }
  } catch {
    error.value = callId
      ? "Couldn't load call analysis. Try again."
      : agentId
        ? "Couldn't load this Voice Agent. Try again."
        : "Couldn't load Voice Agents. Try again.";
  } finally {
    loading.value = false;
    scheduleStatusPoll();
  }
}

function clearStatusPoll(): void {
  if (statusPollTimer !== undefined) window.clearTimeout(statusPollTimer);
  statusPollTimer = undefined;
}

function clearNoticeTimer(): void {
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
  noticeTimer = undefined;
}

function showNotice(message: string): void {
  clearNoticeTimer();
  notice.value = message;
  noticeTimer = window.setTimeout(() => {
    notice.value = '';
    noticeTimer = undefined;
  }, NOTICE_DURATION_MS);
}

function scheduleStatusPoll(): void {
  clearStatusPoll();
  if (!agent.value && !callAnalysisPending.value) return;
  const delay = agent.value ? 5_000 : 2_000;
  const routeAtSchedule = route.fullPath;
  statusPollTimer = window.setTimeout(async () => {
    try {
      if (route.fullPath !== routeAtSchedule) return;
      if (call.value && callAnalysisPending.value) {
        call.value = await getCallAnalysis(call.value.call.id);
      } else if (agent.value) {
        agent.value = await getAgentAnalysis(agent.value.agent.id);
      }
    } catch {
      // Keep the last usable projection visible and try again on the next interval.
    } finally {
      if (route.fullPath === routeAtSchedule) scheduleStatusPoll();
    }
  }, delay);
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
  const agentId = agent.value.agent.id;
  addingCriterion.value = true;
  error.value = '';
  try {
    const result = await createSuccessCriterion(
      agentId,
      newCriterionName.value.trim(),
      newCriterionDescription.value.trim(),
    );
    if (agent.value?.agent.id !== agentId) return;
    agent.value.successCriteria.push({
      ...result.criterion,
      resultDistribution: { pass: 0, fail: 0, notApplicable: 0, unknown: 0 },
    });
    newCriterionName.value = '';
    newCriterionDescription.value = '';
    criterionComposerOpen.value = false;
  } catch {
    error.value = "Couldn't add the Success Criterion. Try again.";
  } finally {
    addingCriterion.value = false;
  }
}

async function loadMoreCalls(): Promise<void> {
  if (!agent.value?.nextCallCursor || loadingMoreCalls.value) return;
  loadingMoreCalls.value = true;
  error.value = '';
  try {
    const page = await getAgentCalls(agent.value.agent.id, agent.value.nextCallCursor);
    agent.value.calls.push(...page.items);
    agent.value.nextCallCursor = page.nextCursor;
    agent.value.totalCallCount = page.totalCount;
  } catch {
    error.value = "Couldn't load older calls. Try again.";
  } finally {
    loadingMoreCalls.value = false;
  }
}

async function removeCriterion(criterionId: string): Promise<void> {
  if (!agent.value) return;
  const agentId = agent.value.agent.id;
  error.value = '';
  try {
    await deleteSuccessCriterion(agentId, criterionId);
    if (agent.value?.agent.id !== agentId) return;
    selectedCriterionId.value = null;
    const refreshedAgent = await getAgentAnalysis(agentId);
    if (agent.value?.agent.id === agentId) agent.value = refreshedAgent;
  } catch {
    error.value = "Couldn't delete the Success Criterion. Try again.";
  }
}

async function requestRecommendations(): Promise<void> {
  if (!agent.value) return;
  const agentId = agent.value.agent.id;
  generatingRecommendations.value = true;
  error.value = '';
  try {
    const result = await generateRecommendations(agentId);
    if (agent.value?.agent.id !== agentId) return;
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
    if (result.criterionIds.length) void pollRecommendations(agentId, result.criterionIds);
  } catch {
    error.value = "Couldn't generate recommendations. Try again.";
  } finally {
    generatingRecommendations.value = false;
  }
}

async function pollRecommendations(agentId: string, criterionIds: string[]): Promise<void> {
  const requestedCriteria = new Set(criterionIds);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(1_500);
    if (agent.value?.agent.id !== agentId) return;
    let current: AgentAnalysisDetail;
    try {
      current = await getAgentAnalysis(agentId);
    } catch {
      error.value = "Couldn't refresh recommendation progress. Try again.";
      return;
    }
    if (agent.value?.agent.id !== agentId) return;
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
      return;
    }
    return;
  }
}

async function removeRecommendation(recommendation: Recommendation): Promise<void> {
  if (!agent.value) return;
  const agentId = agent.value.agent.id;
  error.value = '';
  try {
    await deleteRecommendation(agentId, recommendation.criterionId);
    if (agent.value?.agent.id !== agentId) return;
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

async function runCallAnalysis(): Promise<void> {
  if (!call.value || callAnalysisPending.value) return;
  const callId = call.value.call.id;
  error.value = '';
  try {
    await analyzeCall(callId);
    if (call.value?.call.id !== callId) return;
    call.value = {
      ...call.value,
      analysisStatus: 'queued',
      analysis: null,
      overview: null,
      criterionResults: [],
    };
    showNotice('Call added for analysis');
    scheduleStatusPoll();
  } catch {
    error.value = "Couldn't start analysis. Try again.";
  }
}

async function runAgentAnalysis(window: '24h' | '7d'): Promise<void> {
  if (!agent.value) return;
  analysisMenuOpen.value = false;
  error.value = '';
  try {
    const result = await analyzeAgent(agent.value.agent.id, window);
    showNotice(
      result.queuedCallCount
        ? `${result.queuedCallCount} ${result.queuedCallCount === 1 ? 'call' : 'calls'} added for analysis`
        : 'No calls found in the selected period',
    );
  } catch {
    error.value = "Couldn't analyze calls for the selected period. Try again.";
  }
}

function selectCallIssueFilter(filter: CallIssueFilter): void {
  callIssueFilter.value = filter;
  callFilterOpen.value = false;
  if (filter === 'unflagged') selectedCriterionId.value = null;
}

async function copyRecommendation(recommendation: Recommendation): Promise<void> {
  error.value = '';
  if (!recommendation.promptAddition) return;
  try {
    await navigator.clipboard.writeText(recommendation.promptAddition);
    showNotice('Prompt copied');
  } catch {
    error.value = "Couldn't copy the prompt. Try again.";
  }
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

function formatAnalysisStatus(status: 'queued' | 'processing' | 'completed' | 'failed'): string {
  if (status === 'processing') return 'Processing';
  if (status === 'failed') return 'Failed';
  if (status === 'completed') return 'Complete';
  return 'Queued';
}

function callAnalysisMessage(status: CallAnalysisDetail['analysisStatus']): string {
  if (status === 'processing') return 'Analyzing this call.';
  if (status === 'failed') return 'Select Analyze call to try again.';
  return 'Analysis will start shortly.';
}

function callSummaryMessage(status: CallAnalysisDetail['analysisStatus']): string {
  return status === 'failed'
    ? 'Summary is unavailable because analysis failed.'
    : 'Summary will appear after analysis.';
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

function formatCallDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatCallTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatOverviewValue(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function criterionVisualStatus(
  result: CallAnalysisDetail['criterionResults'][number]['result'],
): 'critical' | 'clear' | 'not_observable' | 'not_applicable' {
  if (result === 'fail') return 'critical';
  if (result === 'pass') return 'clear';
  if (result === 'not_applicable') return 'not_applicable';
  return 'not_observable';
}

function annotationForKey(key: string | null): TurnAnnotation | null {
  if (!key) return null;
  return [...turnAnnotations.value.values()].flat().find((item) => item.key === key) ?? null;
}

async function selectAnnotation(annotation: TurnAnnotation): Promise<void> {
  selectedCriterionId.value = annotation.criterionId;
  selectedAnnotationKey.value = annotation.key;
  await nextTick();
  document
    .getElementById(`turn-${annotation.turnOrdinal}`)
    ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}

function selectAnnotationKey(key: string | null): void {
  const annotation = annotationForKey(key);
  if (annotation) void selectAnnotation(annotation);
}

function firstCriterionAnnotationKey(
  result: CallAnalysisDetail['criterionResults'][number],
): string | null {
  const evidence = result.evidence[0];
  return evidence ? `criterion:${result.id}:${evidence.turnId}` : null;
}

function selectResultEvidence(result: CallAnalysisDetail['criterionResults'][number]): void {
  const key = firstCriterionAnnotationKey(result);
  if (key) {
    selectAnnotationKey(key);
    return;
  }
  void selectCriterion(result.criterionId, undefined, result.actionEvidence[0]?.id);
}

function segmentsForTurn(turnId: string, text: string): TurnSegment[] {
  const ranges = (turnAnnotations.value.get(turnId) ?? [])
    .map((annotation) => {
      const start = text.indexOf(annotation.text);
      return { start, end: start + annotation.text.length, annotation };
    })
    .filter(({ start, end }) => start >= 0 && end > start)
    .sort(
      (left, right) =>
        left.start - right.start ||
        Number(right.annotation.key === selectedAnnotationKey.value) -
          Number(left.annotation.key === selectedAnnotationKey.value),
    );
  if (!ranges.length) return [{ text, annotationKey: null }];
  const segments: TurnSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor)
      segments.push({ text: text.slice(cursor, range.start), annotationKey: null });
    segments.push({
      text: text.slice(range.start, range.end),
      annotationKey: range.annotation.key,
    });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), annotationKey: null });
  return segments;
}

function annotationTooltip(key: string | null): string | undefined {
  const annotation = annotationForKey(key);
  return annotation ? `${annotation.title}\n${annotation.explanation}` : undefined;
}

function primaryAnnotationForTurn(turnId: string): TurnAnnotation | null {
  return turnAnnotations.value.get(turnId)?.[0] ?? null;
}

function selectPrimaryAnnotation(turnId: string): void {
  const annotation = primaryAnnotationForTurn(turnId);
  if (annotation) void selectAnnotation(annotation);
}

function isSelectedEvidenceTurn(turnId: string): boolean {
  return Boolean(
    turnAnnotations.value.get(turnId)?.some(({ key }) => key === selectedAnnotationKey.value),
  );
}

function isResultSelected(result: CallAnalysisDetail['criterionResults'][number]): boolean {
  return (
    annotationForKey(selectedAnnotationKey.value)?.criterionId === result.criterionId ||
    selectedCriterionId.value === result.criterionId
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
</script>

<template>
  <main class="app-shell" :data-view="view">
    <div v-if="notice" class="toast">{{ notice }}</div>
    <div class="page-shell">
      <div v-if="error" class="error-banner">{{ error }}</div>
      <div v-if="loading" class="loading-panel">{{ loadingMessage }}</div>

      <template v-else-if="dashboard">
        <section class="page-heading dashboard-heading">
          <div>
            <h1>Voice AI Observability Copilot</h1>
            <p>Review agent performance and open the calls that need a decision.</p>
          </div>
          <label class="search-field">
            <span aria-hidden="true">⌕</span>
            <input v-model="search" type="search" placeholder="Search agents by name…" />
          </label>
        </section>
        <section class="data-panel fleet-panel">
          <div v-if="!filteredAgents.length" class="empty-panel">
            {{ dashboardEmptyMessage }}
          </div>
          <div v-else class="table-scroll">
            <table class="data-table fleet-table">
              <thead>
                <tr>
                  <th>Agent name</th>
                  <th class="numeric">Calls analyzed</th>
                  <th class="numeric">Avg. duration</th>
                  <th class="numeric">Flagged Issues</th>
                  <th aria-label="Open"></th>
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
                      <span class="agent-icon">AI</span>
                      <div>
                        <strong>{{ item.name }}</strong>
                      </div>
                    </div>
                  </td>
                  <td class="numeric mono">{{ item.summary.callsAnalyzed }}</td>
                  <td class="numeric mono">
                    {{ formatDuration(item.summary.averageDurationSeconds) }}
                  </td>
                  <td class="numeric mono">{{ item.summary.flaggedIssueCount }}</td>
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
                <button type="button" @click="runAgentAnalysis('24h')">
                  <span>Last 24 hours</span><small>Analyze calls</small>
                </button>
                <button type="button" @click="runAgentAnalysis('7d')">
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
            ><strong>{{ agentAdherence === null ? '—' : `${agentAdherence}%` }}</strong>
          </article>
          <article>
            <span>Calls requiring review</span
            ><strong>{{ agent.summary.callsWithFailures }}</strong>
          </article>
        </section>
        <div class="agent-analysis-layout">
          <div class="agent-review-grid">
            <section class="data-panel calls-panel">
              <header class="panel-header call-log-header">
                <h2>Call log</h2>
                <div>
                  <button
                    v-if="selectedCriterion"
                    class="active-criterion-filter"
                    type="button"
                    title="Clear criterion filter"
                    :aria-label="`Clear ${selectedCriterion.name} filter`"
                    @click="selectedCriterionId = null"
                  >
                    <span class="active-criterion-filter-label">{{ selectedCriterion.name }}</span>
                    <span class="active-criterion-filter-dismiss" aria-hidden="true">×</span>
                  </button>
                  <span>{{ visibleCalls.length }} of {{ agent.totalCallCount }}</span>
                </div>
              </header>
              <div v-if="!visibleCalls.length" class="empty-panel compact">
                {{ callLogEmptyMessage }}
              </div>
              <div v-else class="table-scroll calls-scroll">
                <table class="data-table fleet-table calls-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th class="numeric">Duration</th>
                      <th class="numeric">
                        <span class="flagged-issues-heading"
                          ><span>Flagged</span> <span>Issues</span></span
                        >
                      </th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in visibleCalls"
                      :key="item.id"
                      @click="navigate({ callId: item.id })"
                    >
                      <td class="mono">
                        <time :datetime="item.createdAt"
                          ><span class="call-date-part">{{ formatCallDate(item.createdAt) }}</span
                          ><span class="call-time-part">{{
                            formatCallTime(item.createdAt)
                          }}</span></time
                        >
                      </td>
                      <td class="numeric mono">{{ formatDuration(item.durationSeconds) }}</td>
                      <td class="numeric">
                        <span
                          v-if="item.analysisStatus !== 'completed'"
                          class="call-analysis-status"
                          :data-status="item.analysisStatus"
                          >{{ formatAnalysisStatus(item.analysisStatus) }}</span
                        ><template v-else>{{ item.flaggedIssueCount }}</template>
                      </td>
                      <td class="row-chevron">›</td>
                    </tr>
                  </tbody>
                  <tfoot v-if="agent.nextCallCursor">
                    <tr>
                      <td colspan="4">
                        <button
                          class="load-more-calls"
                          type="button"
                          :disabled="loadingMoreCalls"
                          @click.stop="loadMoreCalls"
                        >
                          {{ loadingMoreCalls ? 'Loading…' : 'Load older calls' }}
                        </button>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <section class="data-panel criteria-panel">
              <header class="panel-header">
                <h2>Success criteria</h2>
                <div class="criteria-header-actions">
                  <span>{{ agent.successCriteria.length }} active</span>
                  <button
                    class="criterion-add-toggle"
                    type="button"
                    :aria-expanded="criterionComposerOpen"
                    @click="criterionComposerOpen = !criterionComposerOpen"
                  >
                    {{ criterionComposerOpen ? 'Close' : '+ Add criterion' }}
                  </button>
                </div>
              </header>
              <form
                v-if="criterionComposerOpen"
                class="criterion-composer"
                @submit.prevent="addCriterion"
              >
                <label class="criterion-name-field">
                  <span>Criterion name</span>
                  <input
                    v-model="newCriterionName"
                    maxlength="96"
                    placeholder="Example: Confirm before completion"
                  />
                </label>
                <label>
                  <span>Describe an observable expectation</span>
                  <textarea
                    v-model="newCriterionDescription"
                    rows="2"
                    placeholder="Example: Confirm every material request before completing it."
                  ></textarea>
                </label>
                <div class="criterion-composer-actions">
                  <button
                    class="secondary-button"
                    type="button"
                    @click="criterionComposerOpen = false"
                  >
                    Cancel
                  </button>
                  <button
                    class="primary-button"
                    type="submit"
                    :disabled="
                      addingCriterion ||
                      newCriterionName.trim().length < 2 ||
                      newCriterionDescription.trim().length < 10
                    "
                  >
                    {{ addingCriterion ? 'Adding…' : 'Add criterion' }}
                  </button>
                </div>
              </form>
              <div class="criterion-list">
                <article
                  v-for="criterion in agent.successCriteria"
                  :key="criterion.id"
                  :data-selected="selectedCriterionId === criterion.id"
                >
                  <button
                    class="criterion-filter-button"
                    type="button"
                    :aria-pressed="selectedCriterionId === criterion.id"
                    :aria-label="'Show calls that failed ' + criterion.name"
                    @click="selectCriterion(criterion.id)"
                  >
                    <div class="criterion-title-row">
                      <strong>{{ criterion.name }}</strong>
                    </div>
                    <p>{{ criterion.description }}</p>
                    <div class="criterion-card-footer">
                      <span
                        class="criterion-failure-count"
                        :data-active="criterion.resultDistribution.fail > 0"
                        >{{ criterion.resultDistribution.fail }} failed</span
                      >
                    </div>
                  </button>
                  <button
                    class="criterion-delete-button"
                    type="button"
                    aria-label="Delete criterion"
                    title="Delete criterion"
                    @click="removeCriterion(criterion.id)"
                  >
                    ×
                  </button>
                </article>
              </div>
            </section>
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

      <template v-else-if="call">
        <nav class="breadcrumbs">
          <button @click="navigate({})">Voice Agents</button><span>›</span
          ><button @click="navigate({ agentId: call.call.agentId })">
            {{ call.call.agentName }}</button
          ><span>›</span><strong>{{ formatDate(call.call.createdAt) }}</strong>
        </nav>
        <div class="reference-call-layout">
          <div class="call-primary-column">
            <section class="data-panel call-transcript-reference">
              <header class="panel-header transcript-reference-header">
                <h1>Transcript Forensic View</h1>
                <div class="call-header-badges">
                  <span>Duration: {{ formatDuration(call.call.durationSeconds) }}</span>
                  <span
                    :data-review="
                      call.analysisStatus === 'completed'
                        ? failedResults.length > 0
                          ? 'flagged'
                          : 'clear'
                        : 'pending'
                    "
                    >Flagged issues: {{ failedResults.length }}</span
                  >
                  <button
                    type="button"
                    :disabled="callAnalysisPending"
                    :aria-busy="callAnalysisPending"
                    @click="runCallAnalysis"
                  >
                    {{
                      call.analysisStatus === 'queued'
                        ? 'Queued'
                        : call.analysisStatus === 'processing'
                          ? 'Processing…'
                          : 'Analyze call'
                    }}
                  </button>
                </div>
              </header>
              <div
                v-if="call.analysisStatus !== 'completed'"
                class="call-analysis-notice"
                :data-status="call.analysisStatus"
                role="status"
              >
                <strong>{{ formatAnalysisStatus(call.analysisStatus) }}</strong>
                <span>{{ callAnalysisMessage(call.analysisStatus) }}</span>
              </div>
              <div class="reference-transcript-list">
                <article
                  v-for="turn in call.call.turns"
                  :id="`turn-${turn.ordinal}`"
                  :key="turn.id"
                  class="reference-transcript-turn"
                  :data-speaker="turn.speaker"
                  :data-selected-evidence="isSelectedEvidenceTurn(turn.id)"
                >
                  <div class="reference-speaker-icon">
                    <template v-if="turn.speaker === 'agent'">AI</template>
                    <svg
                      v-else-if="turn.speaker === 'customer'"
                      class="customer-user-icon"
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="8" r="3.25" />
                      <path d="M5.75 19c.5-3.35 2.58-5.25 6.25-5.25s5.75 1.9 6.25 5.25" />
                    </svg>
                    <template v-else>?</template>
                  </div>
                  <div class="reference-turn-copy">
                    <div class="reference-speaker-line">
                      <strong>{{
                        turn.speaker === 'agent'
                          ? call.call.agentName
                          : turn.speaker === 'customer'
                            ? 'Customer'
                            : 'Unknown speaker'
                      }}</strong>
                    </div>
                    <p>
                      <template
                        v-for="(segment, index) in segmentsForTurn(turn.id, turn.text)"
                        :key="`${turn.id}-${index}`"
                        ><button
                          v-if="segment.annotationKey"
                          class="evidence-highlight"
                          data-tone="critical"
                          :aria-pressed="selectedAnnotationKey === segment.annotationKey"
                          :title="annotationTooltip(segment.annotationKey)"
                          type="button"
                          @click="selectAnnotationKey(segment.annotationKey)"
                        >
                          {{ segment.text }}</button
                        ><template v-else>{{ segment.text }}</template></template
                      >
                    </p>
                    <button
                      v-if="primaryAnnotationForTurn(turn.id)"
                      class="reference-turn-callout"
                      data-tone="critical"
                      type="button"
                      @click="selectPrimaryAnnotation(turn.id)"
                    >
                      <span></span>{{ primaryAnnotationForTurn(turn.id)?.title }}
                    </button>
                  </div>
                </article>
                <section v-if="call.call.actionEvents.length" class="reference-action-list">
                  <h2>Executed Call Actions</h2>
                  <article
                    v-for="action in call.call.actionEvents"
                    :key="action.id"
                    class="reference-action-row"
                    :data-action-id="action.id"
                    :data-highlighted="highlightedActionIds.has(action.id)"
                  >
                    <div class="reference-speaker-icon">A</div>
                    <div class="reference-turn-copy">
                      <strong>{{ action.actionName || action.actionType || 'Call Action' }}</strong>
                      <p>
                        {{ action.actionType || 'Action' }} ·
                        {{ action.outcome || 'Outcome unknown' }}
                      </p>
                    </div>
                  </article>
                </section>
              </div>
            </section>
          </div>

          <button
            class="call-sidebar-backdrop"
            type="button"
            aria-label="Close call details"
            :data-open="callSidebarOpen"
            @click="callSidebarOpen = false"
          ></button>

          <aside
            id="call-analysis-sidebar"
            class="call-reference-rail"
            :data-open="callSidebarOpen"
          >
            <nav class="call-sidebar-strip" aria-label="Call detail sections">
              <button type="button" @pointerdown="callSidebarOpen = true">Summary</button>
              <button type="button" @pointerdown="callSidebarOpen = true">Sentiment</button>
              <button type="button" @pointerdown="callSidebarOpen = true">Criteria</button>
            </nav>
            <div class="call-sidebar-header"><strong>Call details</strong></div>
            <div class="call-sidebar-content">
              <section class="data-panel reference-rail-card call-summary-reference">
                <h2>Call summary</h2>
                <p v-if="call.analysisStatus !== 'completed'">
                  {{ callSummaryMessage(call.analysisStatus) }}
                </p>
                <p v-else>{{ call.call.sourceSummary || 'No call summary is available.' }}</p>
                <dl>
                  <div>
                    <dt>Intent</dt>
                    <dd>{{ call.overview?.intent || '—' }}</dd>
                  </div>
                  <div>
                    <dt>Outcome</dt>
                    <dd>
                      {{ call.overview ? formatOverviewValue(call.overview.outcome) : '—' }}
                    </dd>
                  </div>
                </dl>
              </section>

              <section class="data-panel reference-rail-card call-sentiment-reference">
                <h2>Call sentiment</h2>
                <div v-if="call.overview" class="reference-sentiment-visual">
                  <div
                    class="reference-sentiment-donut"
                    :data-sentiment="call.overview.sentiment.label"
                  >
                    <div>
                      <strong>{{ formatOverviewValue(call.overview.sentiment.label) }}</strong>
                      <small>Customer</small>
                    </div>
                  </div>
                  <p>{{ call.overview.sentiment.rationale }}</p>
                </div>
                <p v-else>
                  {{
                    call.analysisStatus === 'failed'
                      ? 'Sentiment is unavailable because analysis failed.'
                      : 'Sentiment will appear after analysis.'
                  }}
                </p>
              </section>

              <section class="data-panel reference-rail-card checklist-reference">
                <h2>Success criteria checklist</h2>
                <div v-if="prioritizedCriterionResults.length" class="checklist">
                  <article
                    v-for="result in prioritizedCriterionResults"
                    :key="result.id"
                    :data-status="criterionVisualStatus(result.result)"
                    :data-selected="isResultSelected(result)"
                  >
                    <span class="check-icon">{{
                      result.result === 'fail' ? '×' : result.result === 'pass' ? '✓' : '—'
                    }}</span>
                    <div>
                      <strong>{{ result.criterionName }}</strong>
                      <p>{{ result.rationale }}</p>
                    </div>
                    <button
                      v-if="
                        result.result === 'fail' &&
                        (result.evidence.length || result.actionEvidence.length)
                      "
                      type="button"
                      @click="selectResultEvidence(result)"
                    >
                      View<br />evidence
                    </button>
                  </article>
                </div>
                <div v-else-if="call.successCriteria.length" class="checklist">
                  <article
                    v-for="criterion in call.successCriteria"
                    :key="criterion.id"
                    data-status="not_observable"
                  >
                    <span class="check-icon">—</span>
                    <div>
                      <strong>{{ criterion.name }}</strong>
                      <p>{{ criterion.description }}</p>
                      <small class="criterion-evaluation-state">
                        {{
                          call.analysisStatus === 'failed' ? 'Not evaluated' : 'Pending evaluation'
                        }}
                      </small>
                    </div>
                  </article>
                </div>
                <div v-else class="panel-empty">
                  {{
                    call.analysisStatus === 'completed'
                      ? 'No Success Criteria were evaluated.'
                      : 'No Success Criteria are configured for this Voice Agent.'
                  }}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </template>
    </div>
  </main>
</template>
