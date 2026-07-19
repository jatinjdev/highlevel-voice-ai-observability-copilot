import { callEvalCorpusSchema, type CallEvalCase, type CallEvalCorpus } from '@copilot/contracts';
import { readFileSync } from 'node:fs';

import type {
  CallEvaluationInput,
  CriterionEvaluation,
  EvaluationCriterion,
} from './evaluation.types';

export interface EvalComparison {
  passed: boolean;
  mismatches: string[];
}

export function loadCallEvalCorpus(path: string): CallEvalCorpus {
  return callEvalCorpusSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function toCallEvaluationInput(evalCase: CallEvalCase): CallEvaluationInput {
  const { payload } = evalCase;
  return {
    callId: uuidFor(80),
    agentId: uuidFor(81),
    durationSeconds: payload.duration,
    configuration: { agentPrompt: evalCase.agentPrompt },
    criteria: EVAL_CRITERIA,
    turns: parseTurns(payload.transcript),
    actionEvents: payload.executedCallActions.map((action, index) => ({
      id: uuidFor(100 + index),
      ordinal: index + 1,
      actionType: readString(action, 'actionType'),
      actionName: readString(action, 'actionName'),
      outcome: readString(action, 'outcome'),
      resultSummary:
        action && typeof action === 'object' ? (action as Record<string, unknown>) : {},
    })),
  };
}

export function compareCriterionEvaluation(
  evalCase: CallEvalCase,
  evaluation: CriterionEvaluation,
  recommendationTargetIds: string[] = [],
): EvalComparison {
  const mismatches: string[] = [];
  const keyByVersion = new Map(
    EVAL_CRITERIA.map((criterion) => [criterion.criterionVersionId, criterion.stableKey]),
  );
  const statuses = new Map(
    evaluation.criterionResults.map((result) => [
      keyByVersion.get(result.criterionVersionId),
      result.result,
    ]),
  );
  for (const check of evalCase.expectations.mustFlagChecks) {
    const status = statuses.get(check);
    if (status !== 'fail') {
      mismatches.push(`${check} was ${status ?? 'missing'}; expected fail`);
    }
  }
  for (const check of evalCase.expectations.mustClearChecks) {
    const status = statuses.get(check);
    if (status !== 'pass') {
      mismatches.push(`${check} was ${status ?? 'missing'}; expected pass`);
    }
  }
  const recommendationTargets = new Set(recommendationTargetIds);
  for (const target of evalCase.expectations.mustRecommendTargets) {
    if (!recommendationTargets.has(target)) {
      mismatches.push(`${target} recommendation was missing`);
    }
  }
  for (const target of evalCase.expectations.mustNotRecommendTargets) {
    if (recommendationTargets.has(target)) {
      mismatches.push(`${target} recommendation was emitted but prohibited`);
    }
  }
  return { passed: mismatches.length === 0, mismatches };
}

export const EVAL_CRITERIA: EvaluationCriterion[] = [
  criterion(1, 'customer_outcome', 'Customer outcome', 'outcome'),
  criterion(2, 'prompt_requirements', 'Prompt requirements', 'adherence'),
  criterion(3, 'problematic_behavior', 'Safe and trustworthy behavior', 'safety'),
  criterion(4, 'agent_caused_frustration', 'Agent-caused frustration', 'diagnostic'),
  criterion(5, 'listening_and_context', 'Listening and context retention', 'diagnostic'),
  criterion(6, 'relevance_and_clarity', 'Relevance and clarity', 'diagnostic'),
  criterion(7, 'appropriate_empathy', 'Appropriate empathy', 'diagnostic'),
  criterion(8, 'grounding_and_uncertainty', 'Grounding and uncertainty', 'safety'),
  criterion(9, 'escalation_judgment', 'Escalation judgment', 'outcome'),
];

function criterion(
  id: number,
  stableKey: string,
  title: string,
  criterionClass: EvaluationCriterion['criterionClass'],
): EvaluationCriterion {
  return {
    criterionId: uuidFor(id),
    criterionVersionId: uuidFor(id + 20),
    stableKey,
    title,
    origin: stableKey === 'prompt_requirements' ? 'prompt_generated' : 'universal',
    criterionClass,
    naturalLanguageRule: `Evaluate ${title.toLowerCase()} using the supplied call evidence.`,
    applicabilityDefinition: { appliesWhen: 'The criterion is exercised by the call.' },
    evaluationInstructions: 'Use categorical outcomes and exact transcript evidence.',
    requiredEvidence: ['quoted transcript evidence'],
    allowedRecommendationTargetIds: ['prompt.core-instructions', 'prompt.fallback-boundaries'],
  };
}

function parseTurns(transcript: string): CallEvaluationInput['turns'] {
  return transcript
    .split(/\r?\n/)
    .map((raw, index) => {
      const match = raw.match(/^\s*([^:]+):\s*(.*)$/);
      const label = match?.[1]?.toLowerCase() ?? '';
      return {
        id: uuidFor(200 + index),
        ordinal: index + 1,
        speaker: /bot|agent|assistant|ai/.test(label)
          ? ('agent' as const)
          : /human|customer|caller|user/.test(label)
            ? ('customer' as const)
            : ('unknown' as const),
        text: (match?.[2] ?? raw).trim(),
      };
    })
    .filter(({ text }) => text.length > 0);
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === 'string' ? field : null;
}

function uuidFor(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
}
