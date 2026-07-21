import { Inject, Injectable } from '@nestjs/common';

import type { CallOverviewGenerator } from './call-overview-generator';
import type { CriterionEvaluator } from './criterion-evaluator';
import type { CallAnalysis, CallEvaluationInput } from './evaluation.types';

export const CRITERION_EVALUATOR = Symbol('CRITERION_EVALUATOR');
export const CALL_OVERVIEW_GENERATOR = Symbol('CALL_OVERVIEW_GENERATOR');

@Injectable()
export class CallAnalyzer {
  constructor(
    @Inject(CRITERION_EVALUATOR) private readonly criterionEvaluator: CriterionEvaluator,
    @Inject(CALL_OVERVIEW_GENERATOR)
    private readonly callOverviewGenerator: CallOverviewGenerator,
  ) {}

  get runtime(): { provider: string | null; model: string | null } {
    return {
      provider: this.criterionEvaluator.provider,
      model: this.criterionEvaluator.model,
    };
  }

  async analyze(input: CallEvaluationInput): Promise<CallAnalysis> {
    const criterionEvaluation = await this.criterionEvaluator.evaluate(input);
    const overview = await this.callOverviewGenerator.generate(input, criterionEvaluation);
    return { ...criterionEvaluation, overview };
  }
}
