<script setup lang="ts">
import { useObservabilityNavigation } from '../../app/navigation';
import { formatDuration } from '../../shared/formatting';
import { useVoiceAgentFleet } from './use-voice-agent-fleet';

const emit = defineEmits<{ notify: [message: string] }>();
const { navigate } = useObservabilityNavigation();
const { agents, emptyMessage, error, loading, search } = useVoiceAgentFleet((message) =>
  emit('notify', message),
);
</script>

<template>
  <div v-if="error" class="error-banner">{{ error }}</div>
  <div v-if="loading" class="loading-panel">Loading Voice Agents…</div>

  <template v-else>
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
      <div v-if="!agents.length" class="empty-panel">{{ emptyMessage }}</div>
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
            <tr v-for="item in agents" :key="item.id" @click="navigate({ agentId: item.id })">
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
</template>
