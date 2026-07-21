<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import { stringQuery } from '../app/navigation';
import CallAnalysisPage from '../features/call/CallAnalysisPage.vue';
import VoiceAgentPage from '../features/agent/VoiceAgentPage.vue';
import VoiceAgentsPage from '../features/fleet/VoiceAgentsPage.vue';
import { initializeMarketplaceSession } from '../lib/api';

const NOTICE_DURATION_MS = 4_000;
const route = useRoute();
const sessionLoading = ref(true);
const sessionError = ref('');
const notice = ref('');
let noticeTimer: number | undefined;

const callId = computed(() => stringQuery(route.query.callId));
const agentId = computed(() => stringQuery(route.query.agentId));
const view = computed(() => (callId.value ? 'call' : agentId.value ? 'agent' : 'dashboard'));
const loadingMessage = computed(() => {
  if (callId.value) return 'Loading call analysis…';
  if (agentId.value) return 'Loading Voice Agent…';
  return 'Loading Voice Agents…';
});

onMounted(initializeSession);
onUnmounted(clearNoticeTimer);

async function initializeSession(): Promise<void> {
  sessionLoading.value = true;
  sessionError.value = '';
  try {
    await initializeMarketplaceSession();
  } catch {
    sessionError.value = callId.value
      ? "Couldn't load call analysis. Try again."
      : agentId.value
        ? "Couldn't load this Voice Agent. Try again."
        : "Couldn't load Voice Agents. Try again.";
  } finally {
    sessionLoading.value = false;
  }
}

function clearNoticeTimer(): void {
  if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
  noticeTimer = undefined;
}

function showNotice(message: string): void {
  clearNoticeTimer();
  notice.value = message;
  noticeTimer = window.setTimeout(() => {
    notice.value = '';
    noticeTimer = undefined;
  }, NOTICE_DURATION_MS);
}
</script>

<template>
  <main class="app-shell" :data-view="view">
    <div v-if="notice" class="toast">{{ notice }}</div>
    <div class="page-shell">
      <div v-if="sessionError" class="error-banner">{{ sessionError }}</div>
      <div v-if="sessionLoading" class="loading-panel">{{ loadingMessage }}</div>
      <CallAnalysisPage
        v-else-if="callId"
        :key="`call:${callId}`"
        :call-id="callId"
        @notify="showNotice"
      />
      <VoiceAgentPage
        v-else-if="agentId"
        :key="`agent:${agentId}`"
        :agent-id="agentId"
        @notify="showNotice"
      />
      <VoiceAgentsPage v-else @notify="showNotice" />
    </div>
  </main>
</template>
