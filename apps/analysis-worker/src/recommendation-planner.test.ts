import { describe, expect, it } from 'vitest';

import { evaluationInput } from './evaluation.test';
import { RecommendationPlanner } from './recommendation-planner';

describe('RecommendationPlanner', () => {
  it('creates one paste-ready prompt recommendation for a failed criterion', () => {
    const input = evaluationInput();
    const criterion = input.criteria[0]!;

    const recommendations = new RecommendationPlanner().plan(
      {
        criterionResults: [
          {
            criterionVersionId: criterion.criterionVersionId,
            result: 'fail',
            rationale: 'The agent did not establish a next step.',
            evidenceTurnIds: [input.turns[0]!.id],
          },
        ],
      },
      input.criteria,
    );

    expect(recommendations).toEqual([
      expect.objectContaining({
        title: criterion.title,
        reason: 'The agent did not establish a next step.',
        proposedChange: criterion.naturalLanguageRule,
      }),
    ]);
  });

  it('does not recommend for passing or prompt-generated criteria', () => {
    const input = evaluationInput();
    const criterion = input.criteria[0]!;
    const planner = new RecommendationPlanner();

    expect(
      planner.plan(
        {
          criterionResults: [
            {
              criterionVersionId: criterion.criterionVersionId,
              result: 'pass',
              rationale: 'Satisfied.',
              evidenceTurnIds: [],
            },
          ],
        },
        input.criteria,
      ),
    ).toEqual([]);
    expect(
      planner.plan(
        {
          criterionResults: [
            {
              criterionVersionId: criterion.criterionVersionId,
              result: 'fail',
              rationale: 'Failed.',
              evidenceTurnIds: [input.turns[0]!.id],
            },
          ],
        },
        [{ ...criterion, origin: 'prompt_generated' }],
      ),
    ).toEqual([]);
  });
});
