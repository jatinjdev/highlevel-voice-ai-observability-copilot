import { Inject, Injectable } from '@nestjs/common';

import type { CriterionEvaluator } from './criterion-evaluator';
import type { CallEvaluationInput, CriterionEvaluation } from './evaluation.types';
import { RecommendationPlanner, type PlannedRecommendation } from './recommendation-planner';

export const CRITERION_EVALUATOR = Symbol('CRITERION_EVALUATOR');

export interface CallAnalysisOutput {
  evaluation: CriterionEvaluation;
  recommendations: PlannedRecommendation[];
}

@Injectable()
export class CallAnalyzer {
  constructor(
    private readonly recommendationPlanner: RecommendationPlanner,
    @Inject(CRITERION_EVALUATOR) private readonly criterionEvaluator: CriterionEvaluator,
  ) {}

  get runtime(): { provider: string | null; model: string | null } {
    return {
      provider: this.criterionEvaluator.provider,
      model: this.criterionEvaluator.model,
    };
  }

  async analyze(input: CallEvaluationInput): Promise<CallAnalysisOutput> {
    const evaluation = await this.criterionEvaluator.evaluate(input);
    const recommendations = this.recommendationPlanner.plan(evaluation, input.criteria);
    return { evaluation, recommendations };
  }
}
