import { type AddressInfo, createServer } from 'node:net';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { OpenCodeLanguageModel } from './opencode-language-model';

describe('OpenCodeLanguageModel', () => {
  it('uses an ephemeral, restricted session for structured evaluation', async () => {
    const requests: Array<{
      method: string;
      path: string;
      authorization: string | undefined;
      body: Record<string, unknown> | undefined;
    }> = [];
    const server = createServer((socket) => {
      let rawRequest = '';
      socket.on('data', (chunk) => {
        rawRequest += chunk.toString();
        const [headers, body = ''] = rawRequest.split('\r\n\r\n');
        const contentLength = Number(/content-length: (\d+)/i.exec(headers ?? '')?.[1] ?? 0);
        if (Buffer.byteLength(body) < contentLength) return;

        const [requestLine = ''] = headers?.split('\r\n') ?? [];
        const [method = '', path = ''] = requestLine.split(' ');
        requests.push({
          method,
          path,
          authorization: /authorization: ([^\r\n]+)/i.exec(headers ?? '')?.[1],
          body: body ? (JSON.parse(body) as Record<string, unknown>) : undefined,
        });

        const responseBody =
          method === 'POST' && path.startsWith('/session/session-test/message')
            ? JSON.stringify({ info: { structured: { result: 'valid' } }, parts: [] })
            : method === 'DELETE'
              ? 'true'
              : JSON.stringify({ id: 'session-test' });
        socket.end(
          `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(responseBody)}\r\nConnection: close\r\n\r\n${responseBody}`,
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    try {
      const model = new OpenCodeLanguageModel({
        baseUrl: `http://127.0.0.1:${port}`,
        providerId: 'openai',
        model: 'gpt-test',
        serverUsername: 'opencode',
        serverPassword: 'server-password',
        requestTimeoutMs: 5_000,
      });
      const result = await model.generateObject({
        schema: z.object({ result: z.literal('valid') }),
        schemaName: 'test_output',
        systemPrompt: 'Return structured output.',
        userPrompt: 'Evaluate this.',
      });

      expect(result).toEqual({ result: 'valid' });
      expect(model.modelId).toBe('opencode:openai/gpt-test');
      expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([
        { method: 'POST', path: '/session' },
        { method: 'POST', path: '/session/session-test/message' },
        { method: 'DELETE', path: '/session/session-test' },
      ]);
      expect(requests.every((request) => request.authorization?.startsWith('Basic '))).toBe(true);
      expect(requests[0]?.body?.permission).toEqual(
        expect.arrayContaining([
          { permission: 'bash', pattern: '*', action: 'deny' },
          { permission: 'read', pattern: '*', action: 'deny' },
        ]),
      );
      expect(requests[1]?.body).toMatchObject({
        model: { providerID: 'openai', modelID: 'gpt-test' },
        format: { type: 'json_schema', retryCount: 2 },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
