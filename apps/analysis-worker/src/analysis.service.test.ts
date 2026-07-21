import { describe, expect, it } from 'vitest';

import { analysisStatusAfterFailure, MAX_ANALYSIS_ATTEMPTS } from './analysis.service';

describe('analysis retry status', () => {
  it('stays processing while SQS can still retry the analysis', () => {
    expect(analysisStatusAfterFailure(1)).toBe('processing');
    expect(analysisStatusAfterFailure(MAX_ANALYSIS_ATTEMPTS - 1)).toBe('processing');
  });

  it('becomes failed only on the terminal queue attempt', () => {
    expect(analysisStatusAfterFailure(MAX_ANALYSIS_ATTEMPTS)).toBe('failed');
  });
});
