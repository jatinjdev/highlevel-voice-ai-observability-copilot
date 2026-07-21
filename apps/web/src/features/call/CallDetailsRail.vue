<script setup lang="ts">
import type { CallAnalysisDetail } from '@copilot/contracts';
import { ref } from 'vue';

import { formatOverviewValue } from '../../shared/formatting';

type CriterionResult = CallAnalysisDetail['criterionResults'][number];

const props = defineProps<{
  call: CallAnalysisDetail;
  prioritizedResults: CriterionResult[];
  selectedAnnotationCriterionId: string | null;
  selectedCriterionId: string | null;
}>();

const emit = defineEmits<{
  selectResult: [result: CriterionResult];
}>();

const open = ref(false);

function summaryMessage(status: CallAnalysisDetail['analysisStatus']): string {
  return status === 'failed'
    ? 'Summary is unavailable because analysis failed.'
    : 'Summary will appear after analysis.';
}

function criterionVisualStatus(
  result: CriterionResult['result'],
): 'critical' | 'clear' | 'not_observable' | 'not_applicable' {
  if (result === 'fail') return 'critical';
  if (result === 'pass') return 'clear';
  if (result === 'not_applicable') return 'not_applicable';
  return 'not_observable';
}

function isSelected(result: CriterionResult): boolean {
  return (
    props.selectedAnnotationCriterionId === result.criterionId ||
    props.selectedCriterionId === result.criterionId
  );
}
</script>

<template>
  <button
    class="call-sidebar-backdrop"
    type="button"
    aria-label="Close call details"
    :data-open="open"
    @click="open = false"
  ></button>

  <aside id="call-analysis-sidebar" class="call-reference-rail" :data-open="open">
    <nav class="call-sidebar-strip" aria-label="Call detail sections">
      <button type="button" @pointerdown="open = true">Summary</button>
      <button type="button" @pointerdown="open = true">Sentiment</button>
      <button type="button" @pointerdown="open = true">Criteria</button>
    </nav>
    <div class="call-sidebar-header"><strong>Call details</strong></div>
    <div class="call-sidebar-content">
      <section class="data-panel reference-rail-card call-summary-reference">
        <h2>Call summary</h2>
        <p v-if="call.analysisStatus !== 'completed'">
          {{ summaryMessage(call.analysisStatus) }}
        </p>
        <p v-else>{{ call.call.sourceSummary || 'No call summary is available.' }}</p>
        <dl>
          <div>
            <dt>Intent</dt>
            <dd>{{ call.overview?.intent || '—' }}</dd>
          </div>
          <div>
            <dt>Outcome</dt>
            <dd>{{ call.overview ? formatOverviewValue(call.overview.outcome) : '—' }}</dd>
          </div>
        </dl>
      </section>

      <section class="data-panel reference-rail-card call-sentiment-reference">
        <h2>Call sentiment</h2>
        <div v-if="call.overview" class="reference-sentiment-visual">
          <div class="reference-sentiment-donut" :data-sentiment="call.overview.sentiment.label">
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
        <div v-if="prioritizedResults.length" class="checklist">
          <article
            v-for="result in prioritizedResults"
            :key="result.id"
            :data-status="criterionVisualStatus(result.result)"
            :data-selected="isSelected(result)"
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
                result.result === 'fail' && (result.evidence.length || result.actionEvidence.length)
              "
              type="button"
              @click="emit('selectResult', result)"
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
                {{ call.analysisStatus === 'failed' ? 'Not evaluated' : 'Pending evaluation' }}
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
</template>
