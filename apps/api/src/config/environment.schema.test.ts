import { describe, expect, it } from 'vitest';

import { validateEnvironment } from './environment.schema';

const OAUTH_ENVIRONMENT = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/database',
  HIGHLEVEL_CLIENT_ID: 'client-id',
  HIGHLEVEL_CLIENT_SECRET: 'client-secret',
  HIGHLEVEL_REDIRECT_URI: 'https://example.com/api/leadconnector/oauth/callback',
  HIGHLEVEL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  HIGHLEVEL_APP_SHARED_SECRET: 'a-production-shared-secret',
  OUTBOX_PUBLISHER_ENABLED: 'true',
  SQS_INGESTION_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789/copilot-ingestion',
  SQS_ANALYSIS_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123456789/copilot-analysis',
};

describe('validateEnvironment', () => {
  it('allows a paired PIT fallback in development', () => {
    expect(
      validateEnvironment({
        SUB_ACCOUNT_LOCATION_ID: 'location-id',
        SUB_ACCOUNT_PIT: 'pit',
      }).NODE_ENV,
    ).toBe('development');
  });

  it('rejects a partial OAuth configuration', () => {
    expect(() => validateEnvironment({ HIGHLEVEL_CLIENT_ID: 'client-id' })).toThrowError(
      /must be configured together/,
    );
  });

  it('requires OAuth in production', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrowError(
      /OAuth configuration is required/,
    );
    expect(validateEnvironment({ NODE_ENV: 'production', ...OAUTH_ENVIRONMENT }).NODE_ENV).toBe(
      'production',
    );
  });

  it('requires a queue URL when publishing is enabled', () => {
    expect(() => validateEnvironment({ OUTBOX_PUBLISHER_ENABLED: 'true' })).toThrowError(
      /SQS_INGESTION_QUEUE_URL and SQS_ANALYSIS_QUEUE_URL are required/,
    );
  });
});
