import { describe, expect, it } from 'vitest';

import { voiceCallEndPayloadSchema } from './voice-call-payload';

describe('voiceCallEndPayloadSchema', () => {
  it('preserves action timing and extracted data needed by evaluators', () => {
    const payload = voiceCallEndPayloadSchema.parse({
      type: 'VoiceAiCallEnd',
      id: 'call-1',
      locationId: 'location-1',
      agentId: 'agent-1',
      createdAt: '2026-07-15T10:00:00.000Z',
      duration: 42,
      transcript: 'Agent: Hello',
      extractedData: { intent: 'booking' },
      executedCallActions: [
        {
          actionType: 'APPOINTMENT_BOOKING',
          executedAt: '2026-07-15T10:00:20.000Z',
          triggerReceivedAt: '2026-07-15T10:00:18.000Z',
        },
      ],
    });

    expect(payload.executedCallActions).toHaveLength(1);
    expect(payload.extractedData).toEqual({ intent: 'booking' });
  });
});
