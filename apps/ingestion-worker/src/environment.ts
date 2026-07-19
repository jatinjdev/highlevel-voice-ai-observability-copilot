import { z } from 'zod';

export const workerEnvironmentSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AWS_REGION: z.string().min(1).default('us-east-1'),
  SQS_INGESTION_QUEUE_URL: z.url(),
  SQS_ENDPOINT: z.url().optional(),
});

export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;

export function validateWorkerEnvironment(value: Record<string, unknown>): WorkerEnvironment {
  return workerEnvironmentSchema.parse(value);
}
