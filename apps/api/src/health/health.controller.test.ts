import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the service as healthy', () => {
    const response = new HealthController().check();

    expect(response.status).toBe('ok');
    expect(response.service).toBe('voice-ai-observability-api');
  });
});
