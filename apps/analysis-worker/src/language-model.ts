import type { z } from 'zod';

export interface StructuredGenerationRequest<TSchema extends z.ZodType> {
  schema: TSchema;
  schemaName: string;
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Provider-neutral port used by the evaluation domain.
 *
 * Each vendor adapter is responsible for translating this request to its SDK
 * and returning data that has been validated against the requested schema.
 */
export interface StructuredOutputLanguageModel {
  readonly modelId: string;

  generateObject<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.output<TSchema>>;
}
