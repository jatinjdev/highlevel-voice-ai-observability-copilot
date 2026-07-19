import { describe, expect, it } from 'vitest';

import { seedScenarioPack, type EvaluationScenarioPack } from './scenario-pack-seeder';

const pack: EvaluationScenarioPack = {
  version: 'scenario-seeder-criteria-integration-v1',
  agent: {
    highLevelAgentId: 'eval-seeder-criteria-integration-agent',
    name: 'Evaluation Agent · Seeder Criteria Integration',
    prompt: 'Help callers.',
    userDefinedCriteria: [
      {
        id: 'honest-completion',
        rule: 'Only claim a request is completed after the relevant action reports success.',
      },
    ],
  },
  calls: [],
};

describe.runIf(process.env.RUN_DATABASE_TESTS === '1')('seedScenarioPack database integration', () => {
  it('activates user-defined Success Criteria for the evaluation Voice Agent', async () => {
    const result = await seedScenarioPack(pack);

    expect(result.criteriaActivated).toBe(1);
  });
});
