import { z } from 'zod';

export const workerEnvironmentSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    AWS_REGION: z.string().min(1).default('us-east-1'),
    SQS_ANALYSIS_QUEUE_URL: z.url(),
    SQS_ENDPOINT: z.url().optional(),
    ANALYSIS_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
    LLM_PROVIDER: z.enum(['none', 'openai-compatible', 'opencode']).default('none'),
    LLM_PROVIDER_ID: z
      .string()
      .regex(/^[a-z0-9._-]+$/)
      .default('openai'),
    LLM_BASE_URL: z.url().default('https://api.openai.com/v1'),
    LLM_MODEL: z.string().min(1).default('gpt-5.6'),
    LLM_API_KEY: z.string().min(1).optional(),
    LLM_STRUCTURED_OUTPUT_MODE: z.enum(['json_schema', 'json_object']).default('json_schema'),
    LLM_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(32_768).default(8_192),
    LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(180_000),
    LLM_EXTRA_BODY_JSON: z
      .string()
      .default('{}')
      .transform((value, context): Record<string, unknown> => {
        try {
          const parsed: unknown = JSON.parse(value);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
          }
        } catch {
          // The validation issue below provides the stable configuration error.
        }
        context.addIssue({ code: 'custom', message: 'LLM_EXTRA_BODY_JSON must be a JSON object.' });
        return z.NEVER;
      }),
    OPENCODE_BASE_URL: z.url().default('http://127.0.0.1:4096'),
    OPENCODE_SERVER_USERNAME: z.string().min(1).default('opencode'),
    OPENCODE_SERVER_PASSWORD: z.string().min(1).optional(),
    OPENCODE_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(240_000),
  })
  .superRefine((environment, context) => {
    const hostname = new URL(environment.LLM_BASE_URL).hostname;
    const usesRemoteApi = !['localhost', '127.0.0.1', '::1'].includes(hostname);
    if (
      environment.LLM_PROVIDER === 'openai-compatible' &&
      usesRemoteApi &&
      !environment.LLM_API_KEY
    ) {
      context.addIssue({
        code: 'custom',
        message: 'LLM_API_KEY is required for a remote OpenAI-compatible endpoint.',
        path: ['LLM_API_KEY'],
      });
    }
  });

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function validateWorkerEnvironment(value: Record<string, unknown>): WorkerEnvironment {
  return workerEnvironmentSchema.parse(value);
}
