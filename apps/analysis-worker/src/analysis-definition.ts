export const ACTIVE_ANALYSIS_DEFINITION = Object.freeze({
  version: '2026-07-18.v2',
  semanticPromptVersion: 'criterion-evaluator-v1',
  evaluatorVersion: 'criterion-centric-call-analysis-v1',
  deterministicEvaluatorVersion: 'none',
  criterionCompilerVersion: 'success-criteria-compiler-v1',
  recommendationCatalogueVersion: 'failed-criterion-prompt-guidance-v1',
  outputSchemaVersion: 4,
});

export type AnalysisDefinition = typeof ACTIVE_ANALYSIS_DEFINITION;
