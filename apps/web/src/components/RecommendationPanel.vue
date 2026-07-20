<script setup lang="ts">
import type { Recommendation } from '@copilot/contracts';

withDefaults(
  defineProps<{
    recommendations: Recommendation[];
    scope?: 'agent' | 'call';
    analyzedCallCount?: number | null;
  }>(),
  { scope: 'agent', analyzedCallCount: null },
);

const emit = defineEmits<{
  copy: [recommendation: Recommendation];
  remove: [recommendation: Recommendation];
}>();

function supportingCallLabel(recommendation: Recommendation): string {
  const count = recommendation.affectedCallCount;
  return `Seen in ${count} ${count === 1 ? 'call' : 'calls'}`;
}
</script>

<template>
  <section class="data-panel recommendation-panel" :data-scope="scope">
    <header class="recommendation-panel-header">
      <div class="recommendation-panel-title">
        <h2>AI recommendations</h2>
        <span v-if="scope === 'agent' && analyzedCallCount !== null">
          Aggregated from {{ analyzedCallCount }} analyzed
          {{ analyzedCallCount === 1 ? 'call' : 'calls' }}
        </span>
      </div>
      <span v-if="recommendations.length">{{ recommendations.length }}</span>
    </header>

    <div v-if="recommendations.length" class="recommendation-cards">
      <article
        v-for="recommendation in recommendations"
        :key="recommendation.id"
        class="recommendation-card"
        :data-recommendation-criterion-id="recommendation.criterionId"
      >
        <div class="recommendation-card-context">
          <span class="recommendation-type">Prompt</span>
          <span class="recommendation-call-support">{{ supportingCallLabel(recommendation) }}</span>
        </div>
        <button
          class="recommendation-delete-button"
          type="button"
          title="Delete recommendation"
          aria-label="Delete recommendation"
          @click="emit('remove', recommendation)"
        >
          ×
        </button>
        <h3>{{ recommendation.headline }}</h3>
        <p :title="recommendation.explanation">{{ recommendation.explanation }}</p>

        <div class="recommendation-copy-block">
          <span>Paste this into your agent prompt</span>
          <button
            type="button"
            aria-label="Copy prompt"
            title="Copy prompt"
            @click="emit('copy', recommendation)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <rect x="8" y="8" width="11" height="11" rx="1.5" />
              <path
                d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"
              />
            </svg>
          </button>
          <blockquote>{{ recommendation.promptAddition }}</blockquote>
        </div>
      </article>
    </div>

    <div v-else class="recommendation-empty-state">
      No recommendation is justified by the analyzed calls.
    </div>
  </section>
</template>
