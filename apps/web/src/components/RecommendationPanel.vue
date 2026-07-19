<script setup lang="ts">
import type { Recommendation } from '@copilot/contracts';

withDefaults(
  defineProps<{
    recommendations: Recommendation[];
    scope: 'agent' | 'call';
    analyzedCallCount?: number;
    selectedRecommendationId?: string | null;
  }>(),
  {
    analyzedCallCount: 0,
    selectedRecommendationId: null,
  },
);

const emit = defineEmits<{
  copy: [recommendation: Recommendation];
  select: [recommendation: Recommendation];
}>();
</script>

<template>
  <section class="recommendations-panel">
    <header class="compact-panel-header">
      <div>
        <h2>AI recommendations</h2>
        <p v-if="scope === 'agent'">Patterns across {{ analyzedCallCount }} analyzed calls</p>
        <p v-else>Changes suggested by this call</p>
      </div>
      <span>{{ recommendations.length }}</span>
    </header>

    <div v-if="recommendations.length" class="recommendation-list">
      <article
        v-for="recommendation in recommendations"
        :key="recommendation.id"
        class="recommendation-card"
        :data-selected="selectedRecommendationId === recommendation.id"
        @click="emit('select', recommendation)"
      >
        <div class="recommendation-meta">
          <span>Prompt</span>
          <small v-if="scope === 'agent'">
            Seen in {{ recommendation.supportingCallCount }}
            {{ recommendation.supportingCallCount === 1 ? 'call' : 'calls' }}
          </small>
        </div>
        <h3>{{ recommendation.title }}</h3>
        <p>{{ recommendation.reason }}</p>
        <div class="copy-block">
          <div>
            <span>Copy and paste into your agent prompt</span>
            <code>{{ recommendation.proposedChange }}</code>
          </div>
          <button
            type="button"
            title="Copy prompt change"
            aria-label="Copy prompt change"
            @click.stop="emit('copy', recommendation)"
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
      No prompt changes are recommended from the current failed criteria.
    </div>
  </section>
</template>
