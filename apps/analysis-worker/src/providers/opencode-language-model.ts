import type { OpencodeClient } from '@opencode-ai/sdk/v2/client' with {
  'resolution-mode': 'import',
};
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { StructuredGenerationRequest, StructuredOutputLanguageModel } from '../language-model';

export interface OpenCodeLanguageModelOptions {
  baseUrl: string;
  providerId: string;
  model: string;
  serverUsername?: string;
  serverPassword?: string;
  requestTimeoutMs: number;
}

const EVALUATION_PERMISSIONS = [
  'bash',
  'edit',
  'write',
  'patch',
  'read',
  'external_directory',
  'webfetch',
  'websearch',
  'task',
  'skill',
].map((permission) => ({ permission, pattern: '*', action: 'deny' as const }));

/**
 * Uses an existing OpenCode server as a structured-output model gateway.
 * OpenCode retains the upstream provider credential; this client only knows the
 * separately configured local-server credential.
 */
export class OpenCodeLanguageModel implements StructuredOutputLanguageModel {
  private readonly client: Promise<OpencodeClient>;
  readonly modelId: string;

  constructor(private readonly options: OpenCodeLanguageModelOptions) {
    this.client = import('@opencode-ai/sdk/v2/client').then(({ createOpencodeClient }) =>
      createOpencodeClient({
        baseUrl: options.baseUrl,
        fetch: authenticatedFetch(options),
      }),
    );
    this.modelId = `opencode:${options.providerId}/${options.model}`;
  }

  async generateObject<TSchema extends z.ZodType>(
    request: StructuredGenerationRequest<TSchema>,
  ): Promise<z.output<TSchema>> {
    const client = await this.client;
    const created = await client.session.create(
      {
        title: `voice-call-evaluation:${randomUUID()}`,
        permission: EVALUATION_PERMISSIONS,
      },
      { throwOnError: true },
    );
    const sessionId = created.data.id;

    try {
      const completion = await client.session.prompt(
        {
          sessionID: sessionId,
          model: {
            providerID: this.options.providerId,
            modelID: this.options.model,
          },
          system: request.systemPrompt,
          parts: [{ type: 'text', text: request.userPrompt }],
          format: {
            type: 'json_schema',
            schema: z.toJSONSchema(request.schema),
            retryCount: 2,
          },
        },
        { throwOnError: true },
      );
      if (completion.data.info.error) {
        const data = completion.data.info.error.data as Record<string, unknown>;
        const detail = typeof data.message === 'string' ? `: ${data.message}` : '';
        throw new Error(`OpenCode evaluation failed: ${completion.data.info.error.name}${detail}`);
      }
      return request.schema.parse(completion.data.info.structured);
    } finally {
      await client.session.delete({ sessionID: sessionId }, { throwOnError: true });
    }
  }
}

function authenticatedFetch(options: OpenCodeLanguageModelOptions): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (options.serverPassword) {
      const username = options.serverUsername ?? 'opencode';
      const token = Buffer.from(`${username}:${options.serverPassword}`).toString('base64');
      headers.set('Authorization', `Basic ${token}`);
    }
    const signals = [init?.signal, AbortSignal.timeout(options.requestTimeoutMs)].filter(
      (signal): signal is AbortSignal => Boolean(signal),
    );
    return fetch(input, {
      ...init,
      headers,
      signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals),
    });
  };
}
