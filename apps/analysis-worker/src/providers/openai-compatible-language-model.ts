import { zodResponseFormat } from 'openai/helpers/zod';
import OpenAI from 'openai';
import { z } from 'zod';

import type { StructuredGenerationRequest, StructuredOutputLanguageModel } from '../language-model';

export type StructuredOutputMode = 'json_schema' | 'json_object';

export interface OpenAiCompatibleLanguageModelOptions {
  apiKey?: string;
  baseUrl: string;
  model: string;
  providerId: string;
  structuredOutputMode: StructuredOutputMode;
  maxOutputTokens: number;
  requestTimeoutMs: number;
  extraBody?: Record<string, unknown>;
}

/**
 * Calls any server implementing the relevant OpenAI Chat Completions subset.
 * JSON Schema is preferred; JSON Object mode exists for less-complete servers.
 */
export class OpenAiCompatibleLanguageModel implements StructuredOutputLanguageModel {
  private readonly client: OpenAI;
  readonly modelId: string;

  constructor(private readonly options: OpenAiCompatibleLanguageModelOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey ?? 'not-required',
      baseURL: options.baseUrl,
      timeout: options.requestTimeoutMs,
      maxRetries: 1,
    });
    this.modelId = `${options.providerId}:${options.model}`;
  }

  async generateObject<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.output<TSchema>> {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const attemptRequest =
        attempt === 1
          ? request
          : {
              ...request,
              systemPrompt: `${request.systemPrompt}\n\nYour previous response was empty or did not match the required schema. Return one complete object that exactly matches the schema.`,
            };
      try {
        if (this.options.structuredOutputMode === 'json_object') {
          return await this.generateJsonObject(attemptRequest);
        }
        return await this.generateJsonSchema(attemptRequest);
      } catch (error) {
        if (attempt === 2 || !isRetryableStructuredOutputError(error)) throw error;
      }
    }
    throw new Error('Structured generation exhausted its attempts.');
  }

  private async generateJsonSchema<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.output<TSchema>> {
    const completion = await this.client.chat.completions.parse(
      buildOpenAiCompatibleJsonSchemaBody(this.options, request),
    );
    const message = completion.choices[0]?.message;
    if (!message) throw new Error('The language model returned no completion choice.');
    if (message.refusal)
      throw new Error(`The language model refused evaluation: ${message.refusal}`);
    if (!message.parsed) throw new Error('The language model returned no structured output.');
    return request.schema.parse(message.parsed);
  }

  private async generateJsonObject<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.output<TSchema>> {
    const responseFormat = zodResponseFormat(request.schema, request.schemaName);
    const completion = await this.client.chat.completions.create({
      ...this.options.extraBody,
      model: this.options.model,
      messages: buildMessages(request, responseFormat.json_schema.schema),
      response_format: { type: 'json_object' },
      max_tokens: this.options.maxOutputTokens,
      store: false,
    });
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error('The language model returned no JSON output.');

    try {
      return request.schema.parse(JSON.parse(withoutMarkdownFence(content)));
    } catch (error) {
      throw new Error('The language model returned invalid evaluation JSON.', { cause: error });
    }
  }
}

/** Exact JSON body used for OpenAI-compatible JSON Schema requests. */
export function buildOpenAiCompatibleJsonSchemaBody<TSchema extends z.ZodType>(
  options: Pick<
    OpenAiCompatibleLanguageModelOptions,
    'model' | 'maxOutputTokens' | 'extraBody'
  >,
  request: StructuredGenerationRequest<TSchema>,
) {
  return {
    ...options.extraBody,
    model: options.model,
    messages: buildMessages(request),
    response_format: zodResponseFormat(request.schema, request.schemaName),
    max_tokens: options.maxOutputTokens,
    store: false,
  };
}

function isRetryableStructuredOutputError(error: unknown): boolean {
  if (error instanceof z.ZodError) return true;
  if (!(error instanceof Error)) return false;
  return /no structured output|no json output|invalid evaluation json/i.test(error.message);
}

function buildMessages<TSchema extends z.ZodType>(
  request: StructuredGenerationRequest<TSchema>,
  requiredSchema?: unknown,
) {
  const systemPrompt = requiredSchema
    ? `${request.systemPrompt}\n\nRequired JSON Schema:\n${JSON.stringify(requiredSchema)}`
    : request.systemPrompt;
  return [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: request.userPrompt },
  ];
}

function withoutMarkdownFence(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}
