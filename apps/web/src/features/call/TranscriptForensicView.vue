<script setup lang="ts">
import type { CallAnalysisDetail } from '@copilot/contracts';
import { computed } from 'vue';

import { formatAnalysisStatus, formatDuration } from '../../shared/formatting';
import {
  buildTurnAnnotations,
  findAnnotation,
  segmentsForTurn,
  type TurnAnnotation,
} from './transcript-evidence';

const props = defineProps<{
  analysisPending: boolean;
  call: CallAnalysisDetail;
  highlightedActionIds: Set<string>;
  selectedAnnotationKey: string | null;
}>();

const emit = defineEmits<{
  analyze: [];
  selectAnnotation: [annotation: TurnAnnotation];
}>();

const failedCount = computed(
  () => props.call.criterionResults.filter(({ result }) => result === 'fail').length,
);
const annotations = computed(() => buildTurnAnnotations(props.call.criterionResults));

function analysisMessage(status: CallAnalysisDetail['analysisStatus']): string {
  if (status === 'processing') return 'Analyzing this call.';
  if (status === 'failed') return 'Select Analyze call to try again.';
  return 'Analysis will start shortly.';
}

function annotationTooltip(key: string | null): string | undefined {
  const annotation = findAnnotation(annotations.value, key);
  return annotation ? `${annotation.title}\n${annotation.explanation}` : undefined;
}

function primaryAnnotation(turnId: string): TurnAnnotation | null {
  return annotations.value.get(turnId)?.[0] ?? null;
}

function isSelectedEvidenceTurn(turnId: string): boolean {
  return Boolean(
    annotations.value.get(turnId)?.some(({ key }) => key === props.selectedAnnotationKey),
  );
}

function selectAnnotationKey(key: string | null): void {
  const annotation = findAnnotation(annotations.value, key);
  if (annotation) emit('selectAnnotation', annotation);
}
</script>

<template>
  <section class="data-panel call-transcript-reference">
    <header class="panel-header transcript-reference-header">
      <h1>Transcript Forensic View</h1>
      <div class="call-header-badges">
        <span>Duration: {{ formatDuration(call.call.durationSeconds) }}</span>
        <span
          :data-review="
            call.analysisStatus === 'completed'
              ? failedCount > 0
                ? 'flagged'
                : 'clear'
              : 'pending'
          "
          >Flagged issues: {{ failedCount }}</span
        >
        <button
          type="button"
          :disabled="analysisPending"
          :aria-busy="analysisPending"
          @click="emit('analyze')"
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
      <span>{{ analysisMessage(call.analysisStatus) }}</span>
    </div>
    <div class="reference-transcript-list">
      <article
        v-for="turn in call.call.turns"
        :id="`turn-${turn.ordinal}`"
        :key="turn.id"
        class="reference-transcript-turn"
        :data-turn-id="turn.id"
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
              v-for="(segment, index) in segmentsForTurn(
                annotations,
                selectedAnnotationKey,
                turn.id,
                turn.text,
              )"
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
            v-if="primaryAnnotation(turn.id)"
            class="reference-turn-callout"
            data-tone="critical"
            type="button"
            @click="emit('selectAnnotation', primaryAnnotation(turn.id)!)"
          >
            <span></span>{{ primaryAnnotation(turn.id)?.title }}
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
            <p>{{ action.actionType || 'Action' }} · {{ action.outcome || 'Outcome unknown' }}</p>
          </div>
        </article>
      </section>
    </div>
  </section>
</template>
