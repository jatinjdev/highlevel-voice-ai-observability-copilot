import { randomBytes } from 'node:crypto';

const [webOrigin] = process.argv.slice(2);
if (!webOrigin) throw new Error('Web origin is required.');

const required = [
  'HIGHLEVEL_CLIENT_ID',
  'HIGHLEVEL_CLIENT_SECRET',
  'HIGHLEVEL_APP_ID',
  'HIGHLEVEL_TOKEN_ENCRYPTION_KEY',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const provider = process.env.PRODUCTION_LLM_PROVIDER ?? process.env.LLM_PROVIDER ?? 'none';
if (provider === 'openai-compatible' && !process.env.LLM_API_KEY) {
  throw new Error('LLM_API_KEY is required for production semantic analysis.');
}

const sharedSecret =
  process.env.HIGHLEVEL_APP_SHARED_SECRET ||
  process.env.EXISTING_HIGHLEVEL_APP_SHARED_SECRET ||
  randomBytes(32).toString('hex');

const configuration = {
  WEB_ORIGIN: webOrigin,
  HIGHLEVEL_CLIENT_ID: process.env.HIGHLEVEL_CLIENT_ID,
  HIGHLEVEL_CLIENT_SECRET: process.env.HIGHLEVEL_CLIENT_SECRET,
  HIGHLEVEL_APP_ID: process.env.HIGHLEVEL_APP_ID,
  HIGHLEVEL_REDIRECT_URI: `${webOrigin}/api/leadconnector/oauth`,
  HIGHLEVEL_POST_INSTALL_REDIRECT_URI: webOrigin,
  HIGHLEVEL_TOKEN_ENCRYPTION_KEY: process.env.HIGHLEVEL_TOKEN_ENCRYPTION_KEY,
  HIGHLEVEL_APP_SHARED_SECRET: sharedSecret,
  LLM_PROVIDER: provider,
  LLM_PROVIDER_ID: process.env.LLM_PROVIDER_ID ?? 'openai',
  LLM_BASE_URL: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
  LLM_MODEL: process.env.LLM_MODEL ?? 'gpt-5.6',
  LLM_API_KEY: process.env.LLM_API_KEY ?? '',
  LLM_STRUCTURED_OUTPUT_MODE: process.env.LLM_STRUCTURED_OUTPUT_MODE ?? 'json_schema',
  LLM_MAX_OUTPUT_TOKENS: process.env.LLM_MAX_OUTPUT_TOKENS ?? '8192',
  LLM_TEMPERATURE: process.env.LLM_TEMPERATURE,
  LLM_REQUEST_TIMEOUT_MS: process.env.LLM_REQUEST_TIMEOUT_MS ?? '180000',
  LLM_EXTRA_BODY_JSON: process.env.LLM_EXTRA_BODY_JSON ?? '{}',
  ANALYSIS_CONCURRENCY: process.env.ANALYSIS_CONCURRENCY ?? '2',
};

process.stdout.write(JSON.stringify(configuration));
