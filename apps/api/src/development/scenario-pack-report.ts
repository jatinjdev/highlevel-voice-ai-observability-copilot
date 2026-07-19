import type { EvaluationScenarioPack } from './scenario-pack-seeder';

export interface ScenarioCallResult {
  callId: string;
  runStatus: string | null;
  outcome: string | null;
  flaggedCriterionKeys: string[];
  recommendationTargets: string[];
  recommendationCriterionKeys: string[];
}

export interface ScenarioPackActualResults {
  calls: ScenarioCallResult[];
  agentRecommendationTargets: string[];
}

export interface ScenarioPackReport {
  packVersion: string;
  passed: boolean;
  calls: Array<{ callId: string; passed: boolean; mismatches: string[] }>;
  agent: { passed: boolean; mismatches: string[] };
}

export function compareScenarioPackResults(
  pack: EvaluationScenarioPack,
  actual: ScenarioPackActualResults,
): ScenarioPackReport {
  if (!pack.expectations) throw new Error(`Scenario pack ${pack.version} has no expectations.`);
  const actualByCall = new Map(actual.calls.map((call) => [call.callId, call]));
  const calls = Object.entries(pack.expectations.calls).map(([callId, expected]) => {
    const result = actualByCall.get(callId);
    const mismatches: string[] = [];
    if (!result) {
      mismatches.push('call analysis was missing');
      return { callId, passed: false, mismatches };
    }
    if (result.runStatus !== 'completed') {
      mismatches.push(`analysis run was ${result.runStatus ?? 'missing'}; expected completed`);
    }
    if (result.outcome !== expected.outcome) {
      mismatches.push(`outcome was ${result.outcome ?? 'missing'}; expected ${expected.outcome}`);
    }
    const flagged = new Set(result.flaggedCriterionKeys);
    for (const criterion of expected.mustFlagCriterionKeys) {
      if (!flagged.has(criterion)) mismatches.push(`${criterion} was not flagged`);
    }
    const targets = new Set(result.recommendationTargets);
    if (result.recommendationTargets.length < (expected.minimumRecommendations ?? 0)) {
      mismatches.push(
        `${result.recommendationTargets.length} recommendations were emitted; expected at least ${expected.minimumRecommendations}`,
      );
    }
    for (const target of expected.mustRecommendTargets) {
      if (!targets.has(target)) mismatches.push(`${target} recommendation was missing`);
    }
    const recommendedCriteria = new Set(result.recommendationCriterionKeys);
    for (const criterion of expected.mustRecommendForCriterionKeys ?? []) {
      if (!recommendedCriteria.has(criterion)) {
        mismatches.push(`${criterion} had no linked recommendation`);
      }
    }
    for (const target of expected.mustNotRecommendTargets ?? []) {
      if (targets.has(target)) mismatches.push(`${target} recommendation was prohibited`);
    }
    for (const prefix of expected.mustRecommendTargetPrefixes ?? []) {
      if (!result.recommendationTargets.some((target) => target.startsWith(prefix))) {
        mismatches.push(`${prefix}* recommendation was missing`);
      }
    }
    for (const prefix of expected.mustNotRecommendTargetPrefixes ?? []) {
      if (result.recommendationTargets.some((target) => target.startsWith(prefix))) {
        mismatches.push(`${prefix}* recommendation was prohibited`);
      }
    }
    return { callId, passed: mismatches.length === 0, mismatches };
  });

  const agentMismatches: string[] = [];
  const flaggedCalls = actual.calls.filter((call) => call.flaggedCriterionKeys.length > 0);
  if (flaggedCalls.length < pack.expectations.agent.minimumFlaggedCalls) {
    agentMismatches.push(
      `${flaggedCalls.length} calls were flagged; expected at least ${pack.expectations.agent.minimumFlaggedCalls}`,
    );
  }
  for (const criterion of pack.expectations.agent.repeatedCriterionKeys) {
    const count = flaggedCalls.filter((call) =>
      call.flaggedCriterionKeys.includes(criterion),
    ).length;
    if (count < 2)
      agentMismatches.push(`${criterion} was flagged in ${count} calls; expected at least 2`);
  }
  const agentTargets = new Set(actual.agentRecommendationTargets);
  if (
    actual.agentRecommendationTargets.length < (pack.expectations.agent.minimumRecommendations ?? 0)
  ) {
    agentMismatches.push(
      `${actual.agentRecommendationTargets.length} aggregate recommendations were emitted; expected at least ${pack.expectations.agent.minimumRecommendations}`,
    );
  }
  for (const target of pack.expectations.agent.mustRecommendTargets) {
    if (!agentTargets.has(target)) {
      agentMismatches.push(`${target} aggregate recommendation was missing`);
    }
  }
  for (const target of pack.expectations.agent.mustNotRecommendTargets ?? []) {
    if (agentTargets.has(target)) {
      agentMismatches.push(`${target} aggregate recommendation was prohibited`);
    }
  }
  for (const prefix of pack.expectations.agent.mustRecommendTargetPrefixes ?? []) {
    if (!actual.agentRecommendationTargets.some((target) => target.startsWith(prefix))) {
      agentMismatches.push(`${prefix}* aggregate recommendation was missing`);
    }
  }
  for (const prefix of pack.expectations.agent.mustNotRecommendTargetPrefixes ?? []) {
    if (actual.agentRecommendationTargets.some((target) => target.startsWith(prefix))) {
      agentMismatches.push(`${prefix}* aggregate recommendation was prohibited`);
    }
  }

  const agent = { passed: agentMismatches.length === 0, mismatches: agentMismatches };
  return {
    packVersion: pack.version,
    passed: calls.every(({ passed }) => passed) && agent.passed,
    calls,
    agent,
  };
}
