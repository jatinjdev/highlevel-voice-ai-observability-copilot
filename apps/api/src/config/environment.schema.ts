import { z } from 'zod';

const encryptionKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'must be a base64-encoded 32-byte key')
  .refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: 'must decode to exactly 32 bytes',
  });

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1).optional(),

    // Local development fallback only. Production never authenticates with this PIT.
    SUB_ACCOUNT_LOCATION_ID: z.string().min(1).optional(),
    SUB_ACCOUNT_PIT: z.string().min(1).optional(),

    HIGHLEVEL_CLIENT_ID: z.string().min(1).optional(),
    HIGHLEVEL_CLIENT_SECRET: z.string().min(1).optional(),
    HIGHLEVEL_APP_ID: z.string().min(1).optional(),
    HIGHLEVEL_REDIRECT_URI: z.url().optional(),
    HIGHLEVEL_POST_INSTALL_REDIRECT_URI: z.url().optional(),
    HIGHLEVEL_TOKEN_ENCRYPTION_KEY: encryptionKeySchema.optional(),
    HIGHLEVEL_APP_SHARED_SECRET: z.string().min(16).optional(),

    AWS_REGION: z.string().min(1).default('us-east-1'),
    SQS_INGESTION_QUEUE_URL: z.url().optional(),
    SQS_ANALYSIS_QUEUE_URL: z.url().optional(),
    SQS_ENDPOINT: z.url().optional(),
    OUTBOX_PUBLISHER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((environment, context) => {
    const pitValues = [environment.SUB_ACCOUNT_LOCATION_ID, environment.SUB_ACCOUNT_PIT];
    const pitCount = pitValues.filter(Boolean).length;
    if (pitCount === 1) {
      context.addIssue({
        code: 'custom',
        message: 'SUB_ACCOUNT_LOCATION_ID and SUB_ACCOUNT_PIT must be configured together.',
        path: ['SUB_ACCOUNT_PIT'],
      });
    }

    const oauthClientValues = [
      environment.HIGHLEVEL_CLIENT_ID,
      environment.HIGHLEVEL_CLIENT_SECRET,
      environment.HIGHLEVEL_REDIRECT_URI,
    ];
    const oauthClientCount = oauthClientValues.filter(Boolean).length;
    const oauthConfigured =
      oauthClientCount === oauthClientValues.length &&
      Boolean(environment.HIGHLEVEL_TOKEN_ENCRYPTION_KEY);
    if (oauthClientCount !== 0 && !oauthConfigured) {
      context.addIssue({
        code: 'custom',
        message:
          'HIGHLEVEL_CLIENT_ID, HIGHLEVEL_CLIENT_SECRET, HIGHLEVEL_REDIRECT_URI, and HIGHLEVEL_TOKEN_ENCRYPTION_KEY must be configured together.',
        path: ['HIGHLEVEL_CLIENT_ID'],
      });
    }

    if (environment.NODE_ENV === 'production' && !oauthConfigured) {
      context.addIssue({
        code: 'custom',
        message: 'HighLevel OAuth configuration is required in production.',
        path: ['HIGHLEVEL_CLIENT_ID'],
      });
    }

    if (environment.NODE_ENV === 'production' && !environment.HIGHLEVEL_APP_SHARED_SECRET) {
      context.addIssue({
        code: 'custom',
        message: 'HIGHLEVEL_APP_SHARED_SECRET is required in production.',
        path: ['HIGHLEVEL_APP_SHARED_SECRET'],
      });
    }

    if (environment.NODE_ENV === 'production' && !environment.HIGHLEVEL_APP_ID) {
      context.addIssue({
        code: 'custom',
        message: 'HIGHLEVEL_APP_ID is required in production.',
        path: ['HIGHLEVEL_APP_ID'],
      });
    }

    if (environment.NODE_ENV === 'production' && !environment.DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        message: 'DATABASE_URL is required in production.',
        path: ['DATABASE_URL'],
      });
    }

    if (
      environment.OUTBOX_PUBLISHER_ENABLED &&
      (!environment.SQS_INGESTION_QUEUE_URL || !environment.SQS_ANALYSIS_QUEUE_URL)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'SQS_INGESTION_QUEUE_URL and SQS_ANALYSIS_QUEUE_URL are required when the outbox publisher is enabled.',
        path: ['SQS_INGESTION_QUEUE_URL'],
      });
    }

    if (environment.NODE_ENV === 'production' && !environment.OUTBOX_PUBLISHER_ENABLED) {
      context.addIssue({
        code: 'custom',
        message: 'The outbox publisher must be enabled in production.',
        path: ['OUTBOX_PUBLISHER_ENABLED'],
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(config: Record<string, unknown>): Environment {
  return environmentSchema.parse(config);
}
