import {
  PROMPT_REMEDIATION_AGENT_NAME,
  promptRemediationEvaluationPack,
} from './prompt-remediation-evaluation-pack';
import { seedScenarioPack } from './scenario-pack-seeder';

async function main(): Promise<void> {
  const result = await seedScenarioPack(promptRemediationEvaluationPack);
  console.log(
    `${PROMPT_REMEDIATION_AGENT_NAME} is ready for the normal pipeline: ` +
      `${result.criteriaActivated} criteria active, ${result.queued} calls queued, ` +
      `${result.skipped} already present.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
