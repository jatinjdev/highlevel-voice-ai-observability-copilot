import { z } from 'zod';

export const criterionEvaluationStatusSchema = z.enum([
  'pass',
  'fail',
  'not_applicable',
  'unknown',
]);

export const modelCriterionEvaluationSchema = z.object({
  criterionResults: z.array(
    z.object({
      criterionId: z.string().regex(/^C\d{2,}$/),
      result: criterionEvaluationStatusSchema,
      rationale: z.string().min(1),
      evidenceTurnIds: z.array(z.string().regex(/^T\d{2,}$/)),
    }),
  ),
});

export type CriterionEvaluationStatus = z.infer<typeof criterionEvaluationStatusSchema>;
export type ModelCriterionEvaluation = z.infer<typeof modelCriterionEvaluationSchema>;

export interface EvaluationCriterion {
  criterionId: string;
  criterionVersionId: string;
  stableKey: string;
  title: string;
  origin: 'universal' | 'prompt_generated' | 'user_defined' | 'configuration';
  criterionClass: 'adherence' | 'safety' | 'outcome' | 'diagnostic';
  naturalLanguageRule: string;
  applicabilityDefinition: Record<string, unknown>;
  evaluationInstructions: string;
  requiredEvidence: string[];
  allowedRecommendationTargetIds: string[];
}

export interface EvaluationTurn {
  id: string;
  ordinal: number;
  speaker: 'agent' | 'customer' | 'unknown';
  text: string;
}

export interface EvaluationActionEvent {
  id: string;
  ordinal: number;
  actionType: string | null;
  actionName: string | null;
  outcome: string | null;
  resultSummary: Record<string, unknown>;
}

export interface CallEvaluationInput {
  callId: string;
  agentId: string;
  durationSeconds: number;
  configuration: Record<string, unknown>;
  criteria: EvaluationCriterion[];
  turns: EvaluationTurn[];
  actionEvents: EvaluationActionEvent[];
}

export interface CriterionResult {
  criterionVersionId: string;
  result: CriterionEvaluationStatus;
  rationale: string;
  evidenceTurnIds: string[];
}

export interface CriterionEvaluation {
  criterionResults: CriterionResult[];
}
