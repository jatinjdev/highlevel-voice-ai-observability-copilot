import { describe, expect, it } from 'vitest';

import { validateWorkerEnvironment } from './environment';

const requiredEnvironment = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/voice_agent',
  AWS_REGION: 'ap-south-1',
  SQS_ANALYSIS_QUEUE_URL: 'https://sqs.ap-south-1.amazonaws.com/123456789012/analysis',
};

describe('validateWorkerEnvironment', () => {
  it('requires an API key for a remote OpenAI-compatible endpoint', () => {
    expect(() =>
      validateWorkerEnvironment({
        ...requiredEnvironment,
        LLM_PROVIDER: 'openai-compatible',
        LLM_BASE_URL: 'https://integrate.api.nvidia.com/v1',
      }),
    ).toThrow('LLM_API_KEY is required for a remote OpenAI-compatible endpoint.');
  });

  it('allows an unauthenticated local OpenAI-compatible endpoint', () => {
    const environment = validateWorkerEnvironment({
      ...requiredEnvironment,
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://127.0.0.1:8080/v1',
    });

    expect(environment.LLM_API_KEY).toBeUndefined();
  });

  it('parses provider request limits from environment strings', () => {
    const environment = validateWorkerEnvironment({
      ...requiredEnvironment,
      LLM_PROVIDER: 'openai-compatible',
      LLM_PROVIDER_ID: 'nvidia',
      LLM_BASE_URL: 'https://integrate.api.nvidia.com/v1',
      LLM_API_KEY: 'test-key',
      LLM_MAX_OUTPUT_TOKENS: '8192',
      LLM_TEMPERATURE: '0',
      LLM_REQUEST_TIMEOUT_MS: '180000',
      ANALYSIS_CONCURRENCY: '3',
    });

    expect(environment).toMatchObject({
      LLM_PROVIDER_ID: 'nvidia',
      LLM_MAX_OUTPUT_TOKENS: 8_192,
      LLM_TEMPERATURE: 0,
      LLM_EXTRA_BODY_JSON: {},
      LLM_REQUEST_TIMEOUT_MS: 180_000,
      ANALYSIS_CONCURRENCY: 3,
    });
  });

  it('parses provider-specific OpenAI-compatible request fields from JSON', () => {
    const environment = validateWorkerEnvironment({
      ...requiredEnvironment,
      LLM_EXTRA_BODY_JSON: '{"chat_template_kwargs":{"enable_thinking":false}}',
    });

    expect(environment.LLM_EXTRA_BODY_JSON).toEqual({
      chat_template_kwargs: { enable_thinking: false },
    });
  });
});
