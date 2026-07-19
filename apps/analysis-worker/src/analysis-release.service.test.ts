import { describe, expect, it } from 'vitest';

import { analysisReleaseIdentity } from './analysis-release.service';

describe('analysisReleaseIdentity', () => {
  it('is stable for the same runtime and changes when the model changes', () => {
    const first = analysisReleaseIdentity({
      provider: 'openai-compatible',
      model: 'model-a',
      modelParameters: { temperature: 0, responseFormat: 'json' },
    });
    const second = analysisReleaseIdentity({
      provider: 'openai-compatible',
      model: 'model-a',
      modelParameters: { responseFormat: 'json', temperature: 0 },
    });
    const differentModel = analysisReleaseIdentity({
      provider: 'openai-compatible',
      model: 'model-b',
      modelParameters: { temperature: 0, responseFormat: 'json' },
    });

    expect(first.releaseKey).toBe(second.releaseKey);
    expect(first.releaseKey).toMatch(/^[a-f0-9]{64}$/);
    expect(first.releaseKey).not.toBe(differentModel.releaseKey);
  });
});
