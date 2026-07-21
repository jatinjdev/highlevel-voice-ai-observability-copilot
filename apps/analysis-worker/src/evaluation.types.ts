import { z } from 'zod';

export const criterionEvaluationStatusSchema = z.enum([
  'pass',
  'fail',
  'not_applicable',
  'unknown',
]);

export const callOutcomeSchema = z.enum([
  'resolved',
  'partially_resolved',
  'unresolved',
  'not_applicable',
  'unknown',
]);

export const callSentimentLabelSchema = z.enum([
  'positive',
  'neutral',
  'negative',
  'mixed',
  'unknown',
]);

export const callOverviewSchema = z.object({
  intent: z.string().min(1),
  outcome: callOutcomeSchema,
  sentiment: z.object({
    label: callSentimentLabelSchema,
    rationale: z.string().min(1),
  }),
});

export const modelCriterionEvaluationSchema = z.object({
  criterionResults: z
    .array(
      z.object({
        criterionId: z
          .string()
          .regex(/^C\d{2,}$/)
          .describe('The supplied criterion alias, for example C01.'),
        result: criterionEvaluationStatusSchema.describe(
          'The checklist verdict chosen using the evaluator decision procedure.',
        ),
        rationale: z
          .string()
          .min(1)
          .describe('One sentence explaining the verdict from the cited call evidence.'),
        evidenceTurnIds: z
          .array(z.string().regex(/^T\d{2,}$/))
          .describe('Supplied transcript aliases that directly support the verdict.'),
        evidenceActionIds: z
          .array(z.string().regex(/^A\d{2,}$/))
          .describe('Supplied action-event aliases that directly support the verdict.'),
      }),
    )
    .describe('Exactly one independent result for every supplied criterion.'),
});

export type CriterionEvaluationStatus = z.infer<typeof criterionEvaluationStatusSchema>;
export type CallOverview = z.infer<typeof callOverviewSchema>;
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

export interface CallAnalysis extends CriterionEvaluation {
  overview: CallOverview;
}
