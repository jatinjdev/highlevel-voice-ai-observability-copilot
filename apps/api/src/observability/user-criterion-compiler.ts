import { createHash } from 'node:crypto';

export interface CompiledUserCriterion {
  stableKey: string;
  title: string;
  criterionClass: 'adherence' | 'safety' | 'outcome' | 'diagnostic';
  applicabilityDefinition: Record<string, unknown>;
  evaluationInstructions: string;
  requiredEvidence: string[];
  allowedRecommendationTargetIds: string[];
  warnings: string[];
}

/** Pure compiler shared by interactive and evaluation-fixture criterion authoring. */
export function compileUserCriterion(rule: string): CompiledUserCriterion {
  const normalized = rule.trim();
  const asksForAudio = /tone|warmth|sounds? |pace|volume|pronunciation|silence|interrupt/i.test(
    normalized,
  );
  const isSafety = /unsafe|privacy|legal|medical|financial|abuse|security|disclos|fabricat/i.test(
    normalized,
  );
  const isOutcome = /book|collect|resolve|transfer|follow.?up|appointment|order|purchase/i.test(
    normalized,
  );
  const criterionClass = isSafety ? 'safety' : isOutcome ? 'outcome' : 'adherence';
  const title = normalized
    .replace(/^(the agent should|agent should|ensure that|make sure)\s+/i, '')
    .replace(/[.!?]+$/, '')
    .slice(0, 90);
  const targetIds = ['prompt.core-instructions'];
  if (
    /unknown|unsupported|unverified|uncertain|fabricat|guarantee|allerg|risk|escalat|fallback|human/i.test(
      normalized,
    )
  ) {
    targetIds.push('prompt.fallback-boundaries');
  }
  if (/knowledge|answer|website|document|menu|product|policy/i.test(normalized)) {
    targetIds.push('knowledge-base.attach-existing', 'knowledge-base.create-or-improve-source');
  }
  if (/action|book|transfer|workflow|appointment/i.test(normalized)) {
    targetIds.push(
      'prompt.action-trigger-instructions',
      'actions.add-or-correct-during-call-action',
    );
  }
  if (/spell|transcri|keyword|name|pronounc/i.test(normalized)) {
    targetIds.push('transcription.boosted-keywords', 'transcription.pronunciation');
  }
  return {
    stableKey: `user.${slug(title)}.${hash(normalized).slice(0, 10)}`,
    title: title || 'User-defined call requirement',
    criterionClass,
    applicabilityDefinition: {
      appliesWhen: 'The call context makes this user-defined rule relevant.',
      source: 'user_defined',
    },
    evaluationInstructions:
      'Use only supplied call evidence. Return not_applicable when the rule is not exercised and unknown when required evidence is absent.',
    requiredEvidence: asksForAudio
      ? ['call recording or audio evidence', 'quoted transcript evidence']
      : ['quoted transcript evidence'],
    allowedRecommendationTargetIds: [...new Set(targetIds)],
    warnings: asksForAudio
      ? ['This rule requires audio evidence. Transcript-only calls will return unknown.']
      : [],
  };
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
