import type { ObservabilityDashboard } from '@copilot/contracts';
import { computed, onMounted, ref } from 'vue';

import { discoverVoiceAgents, getObservabilityDashboard } from '../../lib/api';

export function useVoiceAgentFleet(notify: (message: string) => void) {
  const dashboard = ref<ObservabilityDashboard | null>(null);
  const loading = ref(true);
  const error = ref('');
  const search = ref('');

  const agents = computed(() => {
    const term = search.value.trim().toLowerCase();
    return (dashboard.value?.agents ?? []).filter(({ name }) => name.toLowerCase().includes(term));
  });
  const emptyMessage = computed(() =>
    search.value.trim() ? 'No Voice Agents match your search.' : 'No Voice Agents found.',
  );

  onMounted(load);

  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      let discoveryFailed = false;
      try {
        await discoverVoiceAgents();
      } catch {
        discoveryFailed = true;
      }
      dashboard.value = await getObservabilityDashboard();
      if (discoveryFailed)
        notify("Voice Agents couldn't be refreshed. Showing the last available list.");
    } catch {
      error.value = "Couldn't load Voice Agents. Try again.";
    } finally {
      loading.value = false;
    }
  }

  return { agents, dashboard, emptyMessage, error, loading, search };
}
