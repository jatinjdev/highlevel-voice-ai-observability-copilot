import { Injectable } from '@nestjs/common';

import type { CriterionEvaluation, EvaluationCriterion } from './evaluation.types';

const PROMPT_TARGETS: Record<string, { type: 'prompt'; uiPath: string }> = {
  'prompt.core-instructions': { type: 'prompt', uiPath: 'Build > Agent prompt' },
  'prompt.action-trigger-instructions': { type: 'prompt', uiPath: 'Build > Agent prompt' },
  'prompt.fallback-boundaries': { type: 'prompt', uiPath: 'Build > Agent prompt' },
  'prompt.custom-values': { type: 'prompt', uiPath: 'Build > Agent prompt' },
};

export interface PlannedRecommendation {
  criterionVersionId: string;
  targetId: string;
  type: 'prompt';
  title: string;
  reason: string;
  proposedChange: string;
  uiPath: string;
}

/**
 * Produces one transparent recommendation per failed criterion. The criterion
 * defines both the expected behavior and the permitted configuration targets.
 */
@Injectable()
export class RecommendationPlanner {
  plan(evaluation: CriterionEvaluation, criteria: EvaluationCriterion[]): PlannedRecommendation[] {
    const criterionByVersion = new Map(
      criteria.map((criterion) => [criterion.criterionVersionId, criterion]),
    );

    return evaluation.criterionResults.flatMap((result) => {
      if (result.result !== 'fail') return [];
      const criterion = criterionByVersion.get(result.criterionVersionId);
      if (!criterion || criterion.origin === 'prompt_generated') return [];
      const targetId = criterion.allowedRecommendationTargetIds.find(
        (candidate) => PROMPT_TARGETS[candidate],
      );
      if (!targetId) return [];
      const target = PROMPT_TARGETS[targetId]!;
      return [
        {
          criterionVersionId: criterion.criterionVersionId,
          targetId,
          type: target.type,
          title: criterion.title,
          reason: result.rationale,
          proposedChange: directInstruction(criterion.naturalLanguageRule),
          uiPath: target.uiPath,
        },
      ];
    });
  }
}

function directInstruction(rule: string): string {
  return rule
    .trim()
    .replace(/^(?:the\s+)?(?:voice\s+)?agent\s+should\s+/i, 'You must ')
    .replace(/^(?:ensure|make sure)\s+that\s+(?:the\s+)?(?:voice\s+)?agent\s+/i, 'You must ');
}
