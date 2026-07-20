<script setup lang="ts">
import type { Recommendation } from '@copilot/contracts';

withDefaults(
  defineProps<{
    recommendations: Recommendation[];
    analyzedCallCount?: number;
  }>(),
  { analyzedCallCount: 0 },
);

const emit = defineEmits<{
  copy: [recommendation: Recommendation];
  remove: [recommendation: Recommendation];
}>();
</script>

<template>
  <section class="recommendations-panel">
    <header class="compact-panel-header">
      <div>
        <h2>AI recommendations</h2>
        <p>Patterns across {{ analyzedCallCount }} analyzed calls</p>
      </div>
      <span>{{ recommendations.length }}</span>
    </header>

    <div v-if="recommendations.length" class="recommendation-list">
      <article
        v-for="recommendation in recommendations"
        :key="recommendation.id"
        :data-recommendation-criterion-id="recommendation.criterionId"
        class="recommendation-card"
      >
        <div class="recommendation-meta">
          <span>Prompt</span>
          <small>
            {{ recommendation.affectedCallCount }} failed calls ·
            {{ recommendation.sampledFailureCount }} reviewed
          </small>
        </div>
        <button
          class="delete-recommendation"
          type="button"
          title="Delete recommendation"
          aria-label="Delete recommendation"
          @click="emit('remove', recommendation)"
        >
          ×
        </button>
        <h3>{{ recommendation.headline }}</h3>
        <p>{{ recommendation.explanation }}</p>
        <div class="copy-block">
          <div>
            <span>Copy and paste into your agent prompt</span>
            <code>{{ recommendation.promptAddition }}</code>
          </div>
          <button
            type="button"
            title="Copy prompt change"
            aria-label="Copy prompt change"
            @click="emit('copy', recommendation)"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <rect x="8" y="8" width="11" height="11" rx="2" />
              <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
            </svg>
          </button>
        </div>
      </article>
    </div>
    <div v-else class="panel-empty">
      No recommendations yet. Generate one from a failed Success Criterion above.
    </div>
  </section>
</template>
