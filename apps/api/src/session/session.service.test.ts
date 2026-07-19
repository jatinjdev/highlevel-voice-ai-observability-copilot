import CryptoJS from 'crypto-js';
import { describe, expect, it } from 'vitest';

import { decryptUserContext } from './session.service';

describe('decryptUserContext', () => {
  it('decrypts the CryptoJS payload format used by HighLevel signed user context', () => {
    const secret = 'test-shared-secret';
    const context = {
      userId: 'user-1',
      companyId: 'company-1',
      activeLocation: 'location-1',
    };
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(context), secret).toString();
    expect(decryptUserContext(encrypted, secret)).toEqual(context);
  });

  it('rejects a payload encrypted with a different key', () => {
    const encrypted = CryptoJS.AES.encrypt('{}', 'different-secret').toString();
    expect(() => decryptUserContext(encrypted, 'expected-secret')).toThrow(
      /could not be decrypted/,
    );
  });
});
