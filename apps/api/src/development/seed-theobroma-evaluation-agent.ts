import { seedScenarioPack } from './scenario-pack-seeder';
import { THEOBROMA_AGENT_NAME, theobromaEvaluationPack } from './theobroma-evaluation-pack';

async function main(): Promise<void> {
  const result = await seedScenarioPack(theobromaEvaluationPack);
  console.log(
    `${THEOBROMA_AGENT_NAME} is ready for the normal pipeline: ${result.queued} queued, ` +
      `${result.skipped} already present.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
