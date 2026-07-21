<script setup lang="ts">
import type { CallAnalysisDetail } from '@copilot/contracts';
import { computed, nextTick, ref } from 'vue';

import { useObservabilityNavigation } from '../../app/navigation';
import { formatDate } from '../../shared/formatting';
import CallDetailsRail from './CallDetailsRail.vue';
import TranscriptForensicView from './TranscriptForensicView.vue';
import {
  buildTurnAnnotations,
  findAnnotation,
  firstCriterionAnnotationKey,
  type TurnAnnotation,
} from './transcript-evidence';
import { useCallAnalysis } from './use-call-analysis';

type CriterionResult = CallAnalysisDetail['criterionResults'][number];

const props = defineProps<{ callId: string }>();
const emit = defineEmits<{ notify: [message: string] }>();
const { navigate } = useObservabilityNavigation();
const { analysisPending, call, error, loading, runAnalysis } = useCallAnalysis(
  props.callId,
  (message) => emit('notify', message),
);

const selectedAnnotationKey = ref<string | null>(null);
const selectedCriterionId = ref<string | null>(null);
const annotations = computed(() => buildTurnAnnotations(call.value?.criterionResults ?? []));
const selectedAnnotationCriterionId = computed(
  () => findAnnotation(annotations.value, selectedAnnotationKey.value)?.criterionId ?? null,
);
const prioritizedResults = computed(() => {
  const order = { fail: 0, unknown: 1, pass: 2, not_applicable: 3 } as const;
  return [...(call.value?.criterionResults ?? [])].sort(
    (left, right) => order[left.result] - order[right.result],
  );
});
const highlightedActionIds = computed(() => {
  const result = call.value?.criterionResults.find(
    ({ criterionId }) => criterionId === selectedCriterionId.value,
  );
  return new Set(result?.actionEvidence.map(({ id }) => id) ?? []);
});

async function selectAnnotation(annotation: TurnAnnotation): Promise<void> {
  selectedCriterionId.value = annotation.criterionId;
  selectedAnnotationKey.value = annotation.key;
  await nextTick();
  document
    .getElementById(`turn-${annotation.turnOrdinal}`)
    ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}

async function selectResultEvidence(result: CriterionResult): Promise<void> {
  const key = firstCriterionAnnotationKey(result);
  const annotation = findAnnotation(annotations.value, key);
  if (annotation) {
    await selectAnnotation(annotation);
    return;
  }
  selectedCriterionId.value =
    selectedCriterionId.value === result.criterionId ? null : result.criterionId;
  const actionEventId = result.actionEvidence[0]?.id;
  if (!actionEventId) return;
  await nextTick();
  document
    .querySelector(`[data-action-id="${actionEventId}"]`)
    ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
}
</script>

<template>
  <div v-if="error" class="error-banner">{{ error }}</div>
  <div v-if="loading" class="loading-panel">Loading call analysis…</div>

  <template v-else-if="call">
    <nav class="breadcrumbs">
      <button @click="navigate({})">Voice Agents</button><span>›</span
      ><button @click="navigate({ agentId: call.call.agentId })">{{ call.call.agentName }}</button
      ><span>›</span><strong>{{ formatDate(call.call.createdAt) }}</strong>
    </nav>
    <div class="reference-call-layout">
      <div class="call-primary-column">
        <TranscriptForensicView
          :analysis-pending="analysisPending"
          :call="call"
          :highlighted-action-ids="highlightedActionIds"
          :selected-annotation-key="selectedAnnotationKey"
          @analyze="runAnalysis"
          @select-annotation="selectAnnotation"
        />
      </div>

      <CallDetailsRail
        :call="call"
        :prioritized-results="prioritizedResults"
        :selected-annotation-criterion-id="selectedAnnotationCriterionId"
        :selected-criterion-id="selectedCriterionId"
        @select-result="selectResultEvidence"
      />
    </div>
  </template>
</template>
