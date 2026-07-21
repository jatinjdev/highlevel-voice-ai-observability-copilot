<script setup lang="ts">
import type { AgentAnalysisDetail } from '@copilot/contracts';

import {
  formatAnalysisStatus,
  formatCallDate,
  formatCallTime,
  formatDuration,
} from '../../shared/formatting';

defineProps<{
  calls: AgentAnalysisDetail['calls'];
  loadingMore: boolean;
  nextCursor: string | null;
  selectedCriterionName: string | null;
  totalCount: number;
}>();

const emit = defineEmits<{
  clearCriterion: [];
  loadMore: [];
  openCall: [callId: string];
}>();
</script>

<template>
  <section class="data-panel calls-panel">
    <header class="panel-header call-log-header">
      <h2>Call log</h2>
      <div>
        <button
          v-if="selectedCriterionName"
          class="active-criterion-filter"
          type="button"
          title="Clear criterion filter"
          :aria-label="`Clear ${selectedCriterionName} filter`"
          @click="emit('clearCriterion')"
        >
          <span class="active-criterion-filter-label">{{ selectedCriterionName }}</span>
          <span class="active-criterion-filter-dismiss" aria-hidden="true">×</span>
        </button>
        <span>{{ calls.length }} of {{ totalCount }}</span>
      </div>
    </header>
    <slot v-if="!calls.length" name="empty"></slot>
    <div v-else class="table-scroll calls-scroll">
      <table class="data-table fleet-table calls-table">
        <thead>
          <tr>
            <th>Time</th>
            <th class="numeric">Duration</th>
            <th class="numeric">
              <span class="flagged-issues-heading"><span>Flagged</span> <span>Issues</span></span>
            </th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in calls" :key="item.id" @click="emit('openCall', item.id)">
            <td class="mono">
              <time :datetime="item.createdAt"
                ><span class="call-date-part">{{ formatCallDate(item.createdAt) }}</span
                ><span class="call-time-part">{{ formatCallTime(item.createdAt) }}</span></time
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
        <tfoot v-if="nextCursor">
          <tr>
            <td colspan="4">
              <button
                class="load-more-calls"
                type="button"
                :disabled="loadingMore"
                @click.stop="emit('loadMore')"
              >
                {{ loadingMore ? 'Loading…' : 'Load older calls' }}
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>
</template>
