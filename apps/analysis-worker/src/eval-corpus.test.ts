import { config as loadEnvironment } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CallAnalyzer } from './call-analyzer';
import { ModelCriterionEvaluator } from './criterion-evaluator';
import {
  compareCriterionEvaluation,
  loadCallEvalCorpus,
  toCallEvaluationInput,
} from './eval-corpus';
import type { StructuredOutputLanguageModel } from './language-model';
import { OpenAiCompatibleLanguageModel } from './providers/openai-compatible-language-model';
import { OpenCodeLanguageModel } from './providers/opencode-language-model';
import { RecommendationPlanner } from './recommendation-planner';

const corpusPath = resolve(__dirname, '../evals/harper-valley.highlevel.json');
const corpus = loadCallEvalCorpus(corpusPath);

describe('Harper Valley HighLevel evaluation corpus', () => {
  it('contains attributed HighLevel payloads with provisional human expectations', () => {
    expect(corpus.provenance.license).toBe('CC-BY-4.0');
    expect(corpus.cases).toHaveLength(8);
    expect(new Set(corpus.cases.map((evalCase) => evalCase.payload.id)).size).toBe(8);
    expect(corpus.cases.every((evalCase) => evalCase.payload.type === 'VoiceAiCallEnd')).toBe(true);
  });

  it.each(corpus.cases)('$id has criterion-evaluation-ready evidence', (evalCase) => {
    const input = toCallEvaluationInput(evalCase);
    const criterionKeys = new Set(input.criteria.map((criterion) => criterion.stableKey));

    expect(input.turns.some((turn) => turn.speaker === 'agent')).toBe(true);
    expect(input.turns.some((turn) => turn.speaker === 'customer')).toBe(true);
    for (const key of [
      ...evalCase.expectations.mustFlagChecks,
      ...evalCase.expectations.mustClearChecks,
    ]) {
      expect(criterionKeys.has(key), `Unknown expectation check: ${key}`).toBe(true);
    }
  });

  it.runIf(process.env.RUN_LIVE_EVALS === '1')(
    'meets the provisional criterion expectations',
    async () => {
      loadEnvironment({ path: resolve(__dirname, '../../../.env'), quiet: true });
      const evaluator = new ModelCriterionEvaluator(createLanguageModel());
      const analyzer = new CallAnalyzer(new RecommendationPlanner(), evaluator);
      const failures: string[] = [];
      const requestedIds = new Set(
        (process.env.EVAL_CASE_IDS ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
      const selectedCases = requestedIds.size
        ? corpus.cases.filter((evalCase) => requestedIds.has(evalCase.id))
        : corpus.cases;
      const results: Record<string, unknown>[] = [];

      for (const evalCase of selectedCases) {
        const input = toCallEvaluationInput(evalCase);
        const output = await analyzer.analyze(input);
        const comparison = compareCriterionEvaluation(
          evalCase,
          output.evaluation,
          output.recommendations.map(({ targetId }) => targetId),
        );
        results.push({ id: evalCase.id, ...comparison, evaluation: output.evaluation });
        if (!comparison.passed)
          failures.push(`${evalCase.id}: ${comparison.mismatches.join('; ')}`);
      }

      if (process.env.EVAL_REPORT_PATH) {
        const reportPath = resolve(process.cwd(), process.env.EVAL_REPORT_PATH);
        mkdirSync(dirname(reportPath), { recursive: true });
        writeFileSync(
          reportPath,
          `${JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              model: evaluator.model,
              corpus: corpus.name,
              total: results.length,
              passed: results.filter((result) => result.passed).length,
              results,
            },
            null,
            2,
          )}\n`,
        );
      }
      expect(failures).toEqual([]);
    },
    900_000,
  );
});

function createLanguageModel(): StructuredOutputLanguageModel {
  const provider = process.env.LLM_PROVIDER ?? 'none';
  const providerId = process.env.LLM_PROVIDER_ID ?? 'openai';
  const model = process.env.LLM_MODEL ?? 'gpt-5.6';
  if (provider === 'opencode') {
    return new OpenCodeLanguageModel({
      baseUrl: process.env.OPENCODE_BASE_URL ?? 'http://127.0.0.1:4096',
      providerId,
      model,
      serverUsername: process.env.OPENCODE_SERVER_USERNAME ?? 'opencode',
      serverPassword: process.env.OPENCODE_SERVER_PASSWORD,
      requestTimeoutMs: Number(process.env.OPENCODE_REQUEST_TIMEOUT_MS ?? 240_000),
    });
  }
  if (provider === 'openai-compatible') {
    return new OpenAiCompatibleLanguageModel({
      apiKey: process.env.LLM_API_KEY,
      baseUrl: process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
      model,
      providerId,
      structuredOutputMode:
        process.env.LLM_STRUCTURED_OUTPUT_MODE === 'json_object' ? 'json_object' : 'json_schema',
      maxOutputTokens: Number(process.env.LLM_MAX_OUTPUT_TOKENS ?? 8_192),
      requestTimeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 180_000),
    });
  }
  throw new Error('Set LLM_PROVIDER to opencode or openai-compatible before running live evals.');
}
