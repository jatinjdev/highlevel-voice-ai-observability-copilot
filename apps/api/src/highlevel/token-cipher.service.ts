import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { Environment } from '../config/environment.schema';

const ALGORITHM = 'aes-256-gcm';
const FORMAT_VERSION = 'v1';
const IV_LENGTH_BYTES = 12;

@Injectable()
export class TokenCipherService {
  constructor(private readonly configService: ConfigService<Environment, true>) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();

    return [
      FORMAT_VERSION,
      iv.toString('base64url'),
      authenticationTag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const [version, encodedIv, encodedTag, encodedCiphertext, extraPart] = payload.split('.');
    if (
      version !== FORMAT_VERSION ||
      !encodedIv ||
      !encodedTag ||
      !encodedCiphertext ||
      extraPart
    ) {
      throw new Error('Stored OAuth token has an unsupported encryption format.');
    }

    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.getKey(),
        Buffer.from(encodedIv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Stored OAuth token could not be decrypted.');
    }
  }

  private getKey(): Buffer {
    const encodedKey = this.configService.get('HIGHLEVEL_TOKEN_ENCRYPTION_KEY', {
      infer: true,
    });
    if (!encodedKey) {
      throw new ServiceUnavailableException('HighLevel OAuth encryption is not configured.');
    }

    return Buffer.from(encodedKey, 'base64');
  }
}
