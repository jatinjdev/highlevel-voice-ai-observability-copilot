import { Inject, Injectable } from '@nestjs/common';

import type { CriterionEvaluator } from './criterion-evaluator';
import type { CallEvaluationInput, CriterionEvaluation } from './evaluation.types';

export const CRITERION_EVALUATOR = Symbol('CRITERION_EVALUATOR');

@Injectable()
export class CallAnalyzer {
  constructor(
    @Inject(CRITERION_EVALUATOR) private readonly criterionEvaluator: CriterionEvaluator,
  ) {}

  get runtime(): { provider: string | null; model: string | null } {
    return {
      provider: this.criterionEvaluator.provider,
      model: this.criterionEvaluator.model,
    };
  }

  analyze(input: CallEvaluationInput): Promise<CriterionEvaluation> {
    return this.criterionEvaluator.evaluate(input);
  }
}
