import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'node:crypto';

import { HighLevelWebhookRepository } from './highlevel-webhook.repository';
import {
  asSupportedWebhook,
  parseHighLevelWebhook,
  webhookIdentity,
} from './highlevel-webhook.types';

const HIGHLEVEL_ED25519_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAi2HR1srL4o18O8BRa7gVJY7G7bupbN3H9AwJrHCDiOg=
-----END PUBLIC KEY-----`;

export function verifyEd25519Signature(
  rawBody: Buffer,
  signature: string,
  publicKey = HIGHLEVEL_ED25519_PUBLIC_KEY,
): boolean {
  try {
    return verify(null, rawBody, publicKey, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

@Injectable()
export class HighLevelWebhookService {
  constructor(private readonly webhookRepository: HighLevelWebhookRepository) {}

  async handle(rawBody: Buffer | undefined, signature: string | undefined, body: unknown) {
    if (!rawBody || !signature || !verifyEd25519Signature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid HighLevel webhook signature.');
    }

    const webhook = parseHighLevelWebhook(body);
    const supportedWebhook = asSupportedWebhook(webhook);
    const identity = webhookIdentity(rawBody, webhook);
    const result = await this.webhookRepository.record({
      webhook,
      supportedWebhook,
      ...identity,
    });

    return { received: true, ...result };
  }
}
