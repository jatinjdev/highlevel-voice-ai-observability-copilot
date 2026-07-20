import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import {
  LANGUAGE_MODEL,
  type StructuredGenerationRequest,
  type StructuredOutputLanguageModel,
} from './language-model';

const recommendationOutputSchema = z
  .object({
    promptCoverage: z.enum(['missing', 'covered', 'uncertain']),
    explanation: z.string().min(1),
    recommendation: z
      .object({
        headline: z.string().min(1),
        promptAddition: z.string().min(1),
      })
      .nullable(),
  })
  .superRefine((output, context) => {
    if (output.promptCoverage === 'missing' && !output.recommendation) {
      context.addIssue({
        code: 'custom',
        path: ['recommendation'],
        message: 'A missing prompt concern requires a recommendation.',
      });
    }
    if (output.promptCoverage !== 'missing' && output.recommendation) {
      context.addIssue({
        code: 'custom',
        path: ['recommendation'],
        message: 'Covered or uncertain concerns must not include a recommendation.',
      });
    }
  });

export type RecommendationGenerationOutput = z.infer<typeof recommendationOutputSchema>;

export interface RecommendationFailure {
  rationale: string;
  quotes: string[];
}

@Injectable()
export class RecommendationGenerator {
  constructor(
    @Inject(LANGUAGE_MODEL)
    private readonly languageModel: StructuredOutputLanguageModel | null,
  ) {}

  generate(input: {
    criterionDescription: string;
    currentPrompt: string;
    failures: RecommendationFailure[];
  }): Promise<RecommendationGenerationOutput> {
    if (!this.languageModel) {
      throw new Error('A language-model provider is required to generate recommendations.');
    }
    return this.languageModel.generateObject(buildRecommendationRequest(input));
  }
}

export function buildRecommendationRequest(input: {
  criterionDescription: string;
  currentPrompt: string;
  failures: RecommendationFailure[];
}): StructuredGenerationRequest<typeof recommendationOutputSchema> {
  return {
    schema: recommendationOutputSchema,
    schemaName: 'agent_prompt_recommendation',
    systemPrompt: `You decide whether a Voice AI agent prompt needs one change for a failed success criterion.

Compare the current prompt with the criterion and observed call failures. If the prompt already clearly addresses the concern, return covered. If the evidence is insufficient to decide, return uncertain. Only when the concern is missing, return one concise instruction that can be pasted directly into the agent prompt.

Do not write editing instructions such as "add a rule" or "update the prompt". The promptAddition must itself be the new agent instruction. Do not recommend product settings, tools, knowledge sources, or workflow changes. Return only the requested schema.`,
    userPrompt: `<criterion>
${escapeDelimited(input.criterionDescription)}
</criterion>

<current_prompt>
${escapeDelimited(input.currentPrompt)}
</current_prompt>

<observed_failures>
${input.failures.map(renderFailure).join('\n\n')}
</observed_failures>`,
  };
}

function renderFailure(failure: RecommendationFailure, index: number): string {
  const quotes = failure.quotes.length
    ? failure.quotes.map((quote) => `- ${escapeDelimited(quote)}`).join('\n')
    : '- No transcript quote was retained.';
  return `Failure ${index + 1}: ${escapeDelimited(failure.rationale)}\nEvidence:\n${quotes}`;
}

function escapeDelimited(value: string): string {
  return value.replaceAll('<', '&lt;').replaceAll('>', '&gt;').trim();
}
