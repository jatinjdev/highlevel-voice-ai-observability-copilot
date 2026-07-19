import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const commonWebhookSchema = z
  .object({
    type: z.string().min(1),
    appId: z.string().min(1).optional(),
    locationId: z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
    webhookId: z.string().min(1).optional(),
  })
  .passthrough();

export type HighLevelWebhook = z.infer<typeof commonWebhookSchema>;

export type SupportedHighLevelWebhook =
  | (HighLevelWebhook & {
      type: 'VoiceAiCallEnd';
      id: string;
      locationId: string;
    })
  | (HighLevelWebhook & {
      type: 'INSTALL' | 'UPDATE' | 'UNINSTALL';
      appId: string;
    });

export function parseHighLevelWebhook(body: unknown): HighLevelWebhook {
  const parsed = commonWebhookSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException('Invalid HighLevel webhook payload.');
  return parsed.data;
}

export function asSupportedWebhook(webhook: HighLevelWebhook): SupportedHighLevelWebhook | null {
  if (webhook.type === 'VoiceAiCallEnd') {
    const callId = typeof webhook.id === 'string' ? webhook.id.trim() : '';
    if (!callId || !webhook.locationId) {
      throw new BadRequestException('VoiceAiCallEnd requires id and locationId.');
    }
    return { ...webhook, type: 'VoiceAiCallEnd', id: callId, locationId: webhook.locationId };
  }

  if (webhook.type === 'INSTALL' || webhook.type === 'UPDATE' || webhook.type === 'UNINSTALL') {
    if (!webhook.appId) {
      throw new BadRequestException(`${webhook.type} requires appId.`);
    }
    if (!webhook.locationId && !webhook.companyId) {
      throw new BadRequestException(`${webhook.type} requires locationId or companyId.`);
    }
    return { ...webhook, type: webhook.type, appId: webhook.appId };
  }

  return null;
}

export function webhookIdentity(
  rawBody: Buffer,
  webhook: HighLevelWebhook,
): {
  idempotencyKey: string;
  payloadSha256: string;
} {
  const payloadSha256 = createHash('sha256').update(rawBody).digest('hex');
  const idempotencyKey = webhook.webhookId
    ? `webhook:${webhook.appId ?? 'unknown'}:${webhook.webhookId}`
    : `payload:${payloadSha256}`;
  return { idempotencyKey, payloadSha256 };
}
