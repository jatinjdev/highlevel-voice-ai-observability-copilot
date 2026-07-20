import {
  agentAnalysisDetailSchema,
  agentCallPageSchema,
  agentReanalysisResponseSchema,
  callAnalysisDetailSchema,
  callReanalysisResponseSchema,
  healthResponseSchema,
  observabilityDashboardSchema,
  pipelineSummarySchema,
  pipelineSyncResponseSchema,
  recommendationGenerationResponseSchema,
  successCriterionMutationResponseSchema,
  type HealthResponse,
  type AgentAnalysisDetail,
  type AgentCallPage,
  type AgentReanalysisResponse,
  type AgentReanalysisWindow,
  type CallAnalysisDetail,
  type CallReanalysisResponse,
  type ObservabilityDashboard,
  type PipelineSummary,
  type PipelineSyncResponse,
} from '@copilot/contracts';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
let marketplaceSessionToken: string | null = null;

function withLocation(path: string): string {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  const locationId = new URLSearchParams(window.location.search).get('locationId');
  if (locationId) url.searchParams.set('locationId', locationId);
  return API_BASE_URL.startsWith('http') ? url.toString() : `${url.pathname}${url.search}`;
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error(`API health check failed with status ${response.status}.`);
  }

  return healthResponseSchema.parse(await response.json());
}

export async function initializeMarketplaceSession(): Promise<void> {
  if (new URLSearchParams(window.location.search).has('locationId') || window.parent === window) {
    return;
  }

  const encryptedData = await new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', receiveUserData);
      reject(new Error('HighLevel did not provide signed user context.'));
    }, 8_000);
    function receiveUserData(event: MessageEvent): void {
      const data = event.data as { message?: unknown; payload?: unknown };
      if (data?.message !== 'REQUEST_USER_DATA_RESPONSE' || typeof data.payload !== 'string')
        return;
      window.clearTimeout(timeout);
      window.removeEventListener('message', receiveUserData);
      resolve(data.payload);
    }
    window.addEventListener('message', receiveUserData);
    window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*');
  });

  const response = await fetch(`${API_BASE_URL}/leadconnector/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ encryptedData }),
  });
  if (!response.ok) throw new Error(`Marketplace session failed with status ${response.status}.`);
  const body = (await response.json()) as { token?: unknown };
  if (typeof body.token !== 'string') throw new Error('Marketplace session returned no token.');
  marketplaceSessionToken = body.token;
}

async function authenticatedFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (marketplaceSessionToken) headers.set('Authorization', `Bearer ${marketplaceSessionToken}`);
  return fetch(withLocation(path), { ...init, headers });
}

export async function getObservabilityDashboard(): Promise<ObservabilityDashboard> {
  const response = await authenticatedFetch('/observability/agents');
  if (!response.ok) throw new Error(`Dashboard request failed with status ${response.status}.`);
  return observabilityDashboardSchema.parse(await response.json());
}

export async function getAgentAnalysis(agentId: string): Promise<AgentAnalysisDetail> {
  const response = await authenticatedFetch(`/observability/agents/${encodeURIComponent(agentId)}`);
  if (!response.ok)
    throw new Error(`Agent analysis request failed with status ${response.status}.`);
  return agentAnalysisDetailSchema.parse(await response.json());
}

export async function getAgentCalls(
  agentId: string,
  cursor: string,
  limit = 50,
): Promise<AgentCallPage> {
  const query = new URLSearchParams({ cursor, limit: String(limit) });
  const response = await authenticatedFetch(
    `/observability/agents/${encodeURIComponent(agentId)}/calls?${query.toString()}`,
  );
  if (!response.ok) throw new Error(`Agent calls request failed with status ${response.status}.`);
  return agentCallPageSchema.parse(await response.json());
}

export async function getCallAnalysis(callId: string): Promise<CallAnalysisDetail> {
  const response = await authenticatedFetch(`/observability/calls/${encodeURIComponent(callId)}`);
  if (!response.ok) throw new Error(`Call analysis request failed with status ${response.status}.`);
  return callAnalysisDetailSchema.parse(await response.json());
}

export async function reanalyzeCall(callId: string): Promise<CallReanalysisResponse> {
  const response = await authenticatedFetch(
    `/observability/calls/${encodeURIComponent(callId)}/reanalyze`,
    { method: 'POST' },
  );
  if (!response.ok) throw new Error(`Reanalysis request failed with status ${response.status}.`);
  return callReanalysisResponseSchema.parse(await response.json());
}

export async function reanalyzeAgent(
  agentId: string,
  window: AgentReanalysisWindow,
): Promise<AgentReanalysisResponse> {
  const response = await authenticatedFetch(
    `/observability/agents/${encodeURIComponent(agentId)}/reanalyze`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ window }),
    },
  );
  if (!response.ok)
    throw new Error(`Agent reanalysis request failed with status ${response.status}.`);
  return agentReanalysisResponseSchema.parse(await response.json());
}

export async function createSuccessCriterion(agentId: string, name: string, description: string) {
  const response = await authenticatedFetch(
    `/observability/agents/${encodeURIComponent(agentId)}/success-criteria`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
    },
  );
  if (!response.ok)
    throw new Error(`Success Criterion creation failed with status ${response.status}.`);
  return successCriterionMutationResponseSchema.parse(await response.json());
}

export async function updateSuccessCriterion(
  agentId: string,
  criterionId: string,
  description: string,
) {
  const response = await authenticatedFetch(
    `/observability/agents/${encodeURIComponent(agentId)}/success-criteria/${encodeURIComponent(criterionId)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
    },
  );
  if (!response.ok)
    throw new Error(`Success Criterion update failed with status ${response.status}.`);
  return successCriterionMutationResponseSchema.parse(await response.json());
}

export async function deleteSuccessCriterion(agentId: string, criterionId: string): Promise<void> {
  const response = await authenticatedFetch(
    `/observability/agents/${encodeURIComponent(agentId)}/success-criteria/${encodeURIComponent(criterionId)}`,
    { method: 'DELETE' },
  );
  if (!response.ok)
    throw new Error(`Success Criterion deletion failed with status ${response.status}.`);
}

export async function generateRecommendation(agentId: string, criterionId: string) {
  const response = await authenticatedFetch(
    `/observability/agents/${encodeURIComponent(agentId)}/success-criteria/${encodeURIComponent(criterionId)}/recommendation`,
    { method: 'POST' },
  );
  if (!response.ok)
    throw new Error(`Recommendation generation failed with status ${response.status}.`);
  return recommendationGenerationResponseSchema.parse(await response.json());
}

export async function deleteRecommendation(agentId: string, criterionId: string): Promise<void> {
  const response = await authenticatedFetch(
    `/observability/agents/${encodeURIComponent(agentId)}/success-criteria/${encodeURIComponent(criterionId)}/recommendation`,
    { method: 'DELETE' },
  );
  if (!response.ok)
    throw new Error(`Recommendation deletion failed with status ${response.status}.`);
}

export async function getPipelineSummary(): Promise<PipelineSummary> {
  const response = await authenticatedFetch('/pipeline');

  if (!response.ok) {
    throw new Error(`Pipeline request failed with status ${response.status}.`);
  }

  return pipelineSummarySchema.parse(await response.json());
}

export async function syncPipeline(): Promise<PipelineSyncResponse> {
  const response = await authenticatedFetch('/pipeline/sync', { method: 'POST' });

  if (!response.ok) {
    throw new Error(`Pipeline sync failed with status ${response.status}.`);
  }

  return pipelineSyncResponseSchema.parse(await response.json());
}
