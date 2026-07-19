import { type AddressInfo, createServer } from 'node:net';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { OpenAiCompatibleLanguageModel } from './openai-compatible-language-model';

describe('OpenAiCompatibleLanguageModel', () => {
  it.each(['json_schema', 'json_object'] as const)(
    'uses Chat Completions with %s output',
    async (structuredOutputMode) => {
      const requests: Array<{ authorization: string | undefined; body: Record<string, unknown> }> =
        [];
      const server = createServer((socket) => {
        let rawRequest = '';
        socket.on('data', (chunk) => {
          rawRequest += chunk.toString();
          const [headers, body = ''] = rawRequest.split('\r\n\r\n');
          const contentLength = Number(/content-length: (\d+)/i.exec(headers ?? '')?.[1] ?? 0);
          if (Buffer.byteLength(body) < contentLength) return;

          requests.push({
            authorization: /authorization: ([^\r\n]+)/i.exec(headers ?? '')?.[1],
            body: JSON.parse(body) as Record<string, unknown>,
          });
          const responseBody = JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 0,
            model: 'test-model',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content:
                    structuredOutputMode === 'json_object'
                      ? '```json\n{"result":"valid"}\n```'
                      : '{"result":"valid"}',
                },
              },
            ],
          });
          socket.end(
            `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(responseBody)}\r\nConnection: close\r\n\r\n${responseBody}`,
          );
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;

      try {
        const model = new OpenAiCompatibleLanguageModel({
          apiKey: 'test-key',
          baseUrl: `http://127.0.0.1:${port}/v1`,
          model: 'test-model',
          providerId: 'test-provider',
          structuredOutputMode,
          maxOutputTokens: 4_096,
          requestTimeoutMs: 10_000,
          extraBody: { chat_template_kwargs: { enable_thinking: false } },
        });
        const result = await model.generateObject({
          schema: z.object({ result: z.literal('valid') }),
          schemaName: 'test_output',
          systemPrompt: 'Return JSON.',
          userPrompt: 'Evaluate this.',
        });

        expect(result).toEqual({ result: 'valid' });
        expect(model.modelId).toBe('test-provider:test-model');
        expect(requests).toHaveLength(1);
        expect(requests[0]?.authorization).toBe('Bearer test-key');
        expect(requests[0]?.body).toMatchObject({
          model: 'test-model',
          max_tokens: 4_096,
          store: false,
        });
        expect(requests[0]?.body.response_format).toMatchObject({ type: structuredOutputMode });
        expect(requests[0]?.body.chat_template_kwargs).toEqual({ enable_thinking: false });
        if (structuredOutputMode === 'json_object') {
          const messages = requests[0]?.body.messages as Array<{ content: string }>;
          expect(messages[0]?.content).toContain('Required JSON Schema');
          expect(messages[0]?.content).toContain('"result"');
        }
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    },
  );

  it.each(['empty_output', 'server_error'] as const)(
    'retries once after a transient %s response',
    async (failureMode) => {
      let requestCount = 0;
      const server = createServer((socket) => {
        let rawRequest = '';
        socket.on('data', (chunk) => {
          rawRequest += chunk.toString();
          const [headers, body = ''] = rawRequest.split('\r\n\r\n');
          const contentLength = Number(/content-length: (\d+)/i.exec(headers ?? '')?.[1] ?? 0);
          if (Buffer.byteLength(body) < contentLength) return;

          requestCount += 1;
          if (requestCount === 1 && failureMode === 'server_error') {
            const responseBody = JSON.stringify({
              error: { message: 'Temporary provider failure.', type: 'server_error' },
            });
            socket.end(
              `HTTP/1.1 500 Internal Server Error\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(responseBody)}\r\nConnection: close\r\n\r\n${responseBody}`,
            );
            return;
          }
          const responseBody = JSON.stringify({
            id: `chatcmpl-test-${requestCount}`,
            object: 'chat.completion',
            created: 0,
            model: 'test-model',
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content:
                    requestCount === 1 && failureMode === 'empty_output'
                      ? ''
                      : '{"result":"valid"}',
                },
              },
            ],
          });
          socket.end(
            `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(responseBody)}\r\nConnection: close\r\n\r\n${responseBody}`,
          );
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;

      try {
        const model = new OpenAiCompatibleLanguageModel({
          apiKey: 'test-key',
          baseUrl: `http://127.0.0.1:${port}/v1`,
          model: 'test-model',
          providerId: 'test-provider',
          structuredOutputMode: 'json_schema',
          maxOutputTokens: 4_096,
          requestTimeoutMs: 10_000,
          extraBody: {},
        });

        await expect(
          model.generateObject({
            schema: z.object({ result: z.literal('valid') }),
            schemaName: 'test_output',
            systemPrompt: 'Return JSON.',
            userPrompt: 'Evaluate this.',
          }),
        ).resolves.toEqual({ result: 'valid' });
        expect(requestCount).toBe(2);
      } finally {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      }
    },
  );
});
