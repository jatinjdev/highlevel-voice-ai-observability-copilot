import { callEvalCorpusSchema } from '@copilot/contracts';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { seedScenarioPack } from './scenario-pack-seeder';

const MOCK_AGENT_ID = 'eval-harper-valley-agent';
const MOCK_AGENT_NAME = 'Evaluation Agent · Harper Valley Bank';
const MOCK_AGENT_PROMPT = [
  'You are the Harper Valley National Bank phone agent.',
  'Resolve supported banking requests accurately, including replacing cards, ordering checks,',
  'scheduling appointments, checking branch hours, and answering account-service questions.',
  'Ask for clarification when a critical detail is unclear.',
  'Use the configured action for requests that change customer state, and only confirm completion',
  'after that action succeeds. Never invent policy, account, or transaction details.',
].join(' ');

async function main(): Promise<void> {
  const corpusPath = resolve(
    process.cwd(),
    '../analysis-worker/evals/harper-valley.highlevel.json',
  );
  const corpus = callEvalCorpusSchema.parse(JSON.parse(await readFile(corpusPath, 'utf8')));
  const result = await seedScenarioPack({
    version: corpus.provenance.revision,
    agent: {
      highLevelAgentId: MOCK_AGENT_ID,
      name: MOCK_AGENT_NAME,
      prompt: MOCK_AGENT_PROMPT,
    },
    calls: corpus.cases.map((evaluationCase) => ({
      name: evaluationCase.name,
      payload: evaluationCase.payload,
      fixtureMetadata: {
        dataset: evaluationCase.provenance.dataset,
        sourceId: evaluationCase.provenance.sourceId,
        sourceUrl: evaluationCase.provenance.sourceUrl,
        license: evaluationCase.provenance.license,
        taskType: evaluationCase.provenance.taskType,
      },
    })),
  });

  console.log(
    'Evaluation corpus ready for the normal pipeline: ' +
      result.queued +
      ' queued, ' +
      result.skipped +
      ' already present.',
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
