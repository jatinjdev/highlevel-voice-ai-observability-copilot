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
      evidenceActionIds: z.array(z.string().regex(/^A\d{2,}$/)),
    }),
  ),
});

export type CriterionEvaluationStatus = z.infer<typeof criterionEvaluationStatusSchema>;
export type ModelCriterionEvaluation = z.infer<typeof modelCriterionEvaluationSchema>;

export interface EvaluationCriterion {
  criterionId: string;
  description: string;
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
  criteria: EvaluationCriterion[];
  turns: EvaluationTurn[];
  actionEvents: EvaluationActionEvent[];
}

export interface CriterionResult {
  criterionId: string;
  result: CriterionEvaluationStatus;
  rationale: string;
  evidenceTurnIds: string[];
  evidenceActionIds: string[];
}

export interface CriterionEvaluation {
  criterionResults: CriterionResult[];
}
