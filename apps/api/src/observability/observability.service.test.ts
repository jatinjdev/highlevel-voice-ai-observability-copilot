import { describe, expect, it } from 'vitest';

import { projectCallAnalysisStatus } from './observability.service';

describe('call analysis status projection', () => {
  const older = new Date('2026-07-20T20:00:00.000Z');
  const newer = new Date('2026-07-20T20:00:01.000Z');

  it('shows queued when a durable analysis request is newer than the latest run', () => {
    expect(
      projectCallAnalysisStatus({ status: 'completed', createdAt: older }, { occurredAt: newer }),
    ).toBe('queued');
  });

  it('shows processing after the worker has claimed the queued request', () => {
    expect(
      projectCallAnalysisStatus({ status: 'processing', createdAt: newer }, { occurredAt: older }),
    ).toBe('processing');
  });

  it('preserves the completed status after the requested run finishes', () => {
    expect(
      projectCallAnalysisStatus({ status: 'completed', createdAt: newer }, { occurredAt: older }),
    ).toBe('completed');
  });
});
