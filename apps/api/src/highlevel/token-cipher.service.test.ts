import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { Environment } from '../config/environment.schema';
import { TokenCipherService } from './token-cipher.service';

function createCipher(): TokenCipherService {
  const key = Buffer.alloc(32, 11).toString('base64');
  const configService = {
    get: (name: keyof Environment) => (name === 'HIGHLEVEL_TOKEN_ENCRYPTION_KEY' ? key : undefined),
  } as ConfigService<Environment, true>;
  return new TokenCipherService(configService);
}

describe('TokenCipherService', () => {
  it('round-trips a token without storing plaintext', () => {
    const cipher = createCipher();
    const encrypted = cipher.encrypt('refresh-token');

    expect(encrypted).not.toContain('refresh-token');
    expect(cipher.decrypt(encrypted)).toBe('refresh-token');
  });

  it('rejects a tampered token', () => {
    const cipher = createCipher();
    const encrypted = cipher.encrypt('access-token');
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;

    expect(() => cipher.decrypt(tampered)).toThrowError(/could not be decrypted/);
  });
});
