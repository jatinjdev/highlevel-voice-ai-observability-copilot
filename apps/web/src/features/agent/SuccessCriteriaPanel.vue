<script setup lang="ts">
import type { AgentAnalysisDetail } from '@copilot/contracts';
import { ref } from 'vue';

const props = defineProps<{
  adding: boolean;
  criteria: AgentAnalysisDetail['successCriteria'];
  createCriterion: (name: string, description: string) => Promise<boolean>;
  selectedCriterionId: string | null;
}>();

const emit = defineEmits<{
  remove: [criterionId: string];
  select: [criterionId: string];
}>();

const composerOpen = ref(false);
const name = ref('');
const description = ref('');

async function submit(): Promise<void> {
  const normalizedName = name.value.trim();
  const normalizedDescription = description.value.trim();
  if (normalizedName.length < 2 || normalizedDescription.length < 10) return;
  const created = await props.createCriterion(normalizedName, normalizedDescription);
  if (!created) return;
  name.value = '';
  description.value = '';
  composerOpen.value = false;
}
</script>

<template>
  <section class="data-panel criteria-panel">
    <header class="panel-header">
      <h2>Success criteria</h2>
      <div class="criteria-header-actions">
        <span>{{ criteria.length }} active</span>
        <button
          class="criterion-add-toggle"
          type="button"
          :aria-expanded="composerOpen"
          @click="composerOpen = !composerOpen"
        >
          {{ composerOpen ? 'Close' : '+ Add criterion' }}
        </button>
      </div>
    </header>
    <form v-if="composerOpen" class="criterion-composer" @submit.prevent="submit">
      <label class="criterion-name-field">
        <span>Criterion name</span>
        <input v-model="name" maxlength="96" placeholder="Example: Confirm before completion" />
      </label>
      <label>
        <span>Describe an observable expectation</span>
        <textarea
          v-model="description"
          rows="2"
          placeholder="Example: Confirm every material request before completing it."
        ></textarea>
      </label>
      <div class="criterion-composer-actions">
        <button class="secondary-button" type="button" @click="composerOpen = false">Cancel</button>
        <button
          class="primary-button"
          type="submit"
          :disabled="adding || name.trim().length < 2 || description.trim().length < 10"
        >
          {{ adding ? 'Adding…' : 'Add criterion' }}
        </button>
      </div>
    </form>
    <div class="criterion-list">
      <article
        v-for="criterion in criteria"
        :key="criterion.id"
        :data-selected="selectedCriterionId === criterion.id"
      >
        <button
          class="criterion-filter-button"
          type="button"
          :aria-pressed="selectedCriterionId === criterion.id"
          :aria-label="'Show calls that failed ' + criterion.name"
          @click="emit('select', criterion.id)"
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
          @click="emit('remove', criterion.id)"
        >
          ×
        </button>
      </article>
    </div>
  </section>
</template>
