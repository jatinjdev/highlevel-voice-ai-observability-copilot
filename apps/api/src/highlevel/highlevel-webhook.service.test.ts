import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { HighLevelWebhookService, verifyEd25519Signature } from './highlevel-webhook.service';
import type { HighLevelWebhookRepository } from './highlevel-webhook.repository';
import {
  asSupportedWebhook,
  parseHighLevelWebhook,
  webhookIdentity,
} from './highlevel-webhook.types';

describe('HighLevelWebhookService', () => {
  it('verifies an Ed25519 signature over the exact raw body', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const payload = Buffer.from('{"type":"UNINSTALL","locationId":"location-id"}');
    const signature = sign(null, payload, privateKey).toString('base64');

    expect(
      verifyEd25519Signature(
        payload,
        signature,
        publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      ),
    ).toBe(true);
    expect(
      verifyEd25519Signature(
        Buffer.from(`${payload.toString()} `),
        signature,
        publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      ),
    ).toBe(false);
  });

  it('rejects an unsigned uninstall before touching the database', async () => {
    const record = vi.fn();
    const service = new HighLevelWebhookService({
      record,
    } as unknown as HighLevelWebhookRepository);

    await expect(
      service.handle(Buffer.from('{}'), undefined, {
        type: 'UNINSTALL',
        locationId: 'location-id',
      }),
    ).rejects.toThrow(/Invalid HighLevel webhook signature/);
    expect(record).not.toHaveBeenCalled();
  });

  it('creates a stable fallback identity from the exact payload bytes', () => {
    const body = Buffer.from('{"type":"VoiceAiCallEnd","id":"call-1","locationId":"loc-1"}');
    const webhook = parseHighLevelWebhook(JSON.parse(body.toString()));

    expect(webhookIdentity(body, webhook)).toEqual(webhookIdentity(body, webhook));
    expect(
      webhookIdentity(Buffer.concat([body, Buffer.from(' ')]), webhook).idempotencyKey,
    ).not.toBe(webhookIdentity(body, webhook).idempotencyKey);
  });

  it('accepts the identifier-only fields required for call ingestion', () => {
    const webhook = asSupportedWebhook(
      parseHighLevelWebhook({
        type: 'VoiceAiCallEnd',
        id: 'call-1',
        locationId: 'location-1',
        transcript: 'This remains in the inbox, not the queue envelope.',
      }),
    );

    expect(webhook).toMatchObject({
      type: 'VoiceAiCallEnd',
      id: 'call-1',
      locationId: 'location-1',
    });
  });
});
