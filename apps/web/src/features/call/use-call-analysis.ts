import type { CallAnalysisDetail } from '@copilot/contracts';
import { computed, onMounted, onUnmounted, ref } from 'vue';

import { analyzeCall, getCallAnalysis } from '../../lib/api';

const CALL_POLL_INTERVAL_MS = 2_000;

export function useCallAnalysis(callId: string, notify: (message: string) => void) {
  const call = ref<CallAnalysisDetail | null>(null);
  const loading = ref(true);
  const error = ref('');
  let statusPollTimer: number | undefined;
  let disposed = false;

  const analysisPending = computed(
    () => call.value?.analysisStatus === 'queued' || call.value?.analysisStatus === 'processing',
  );

  onMounted(load);
  onUnmounted(() => {
    disposed = true;
    clearStatusPoll();
  });

  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const current = await getCallAnalysis(callId);
      if (!disposed) call.value = current;
    } catch {
      if (!disposed) error.value = "Couldn't load call analysis. Try again.";
    } finally {
      if (!disposed) {
        loading.value = false;
        scheduleStatusPoll();
      }
    }
  }

  function clearStatusPoll(): void {
    if (statusPollTimer !== undefined) window.clearTimeout(statusPollTimer);
    statusPollTimer = undefined;
  }

  function scheduleStatusPoll(): void {
    clearStatusPoll();
    if (!analysisPending.value || disposed) return;
    statusPollTimer = window.setTimeout(async () => {
      try {
        const current = await getCallAnalysis(callId);
        if (!disposed) call.value = current;
      } catch {
        // Keep the transcript visible and retry while analysis remains pending.
      } finally {
        if (!disposed) scheduleStatusPoll();
      }
    }, CALL_POLL_INTERVAL_MS);
  }

  async function runAnalysis(): Promise<void> {
    if (!call.value || analysisPending.value) return;
    error.value = '';
    try {
      await analyzeCall(callId);
      if (disposed || !call.value) return;
      call.value = {
        ...call.value,
        analysisStatus: 'queued',
        analysis: null,
        overview: null,
        criterionResults: [],
      };
      notify('Call added for analysis');
      scheduleStatusPoll();
    } catch {
      error.value = "Couldn't start analysis. Try again.";
    }
  }

  return { analysisPending, call, error, loading, runAnalysis };
}
