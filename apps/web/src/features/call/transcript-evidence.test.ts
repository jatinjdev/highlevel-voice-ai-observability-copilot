import type { CallAnalysisDetail } from '@copilot/contracts';
import { describe, expect, it } from 'vitest';

import { buildTurnAnnotations, findAnnotation, segmentsForTurn } from './transcript-evidence';

function failedResult(
  id: string,
  criterionId: string,
  text: string,
): CallAnalysisDetail['criterionResults'][number] {
  return {
    id,
    criterionId,
    criterionName: `Criterion ${criterionId}`,
    criterionDescription: `Description ${criterionId}`,
    result: 'fail',
    rationale: `Failed ${criterionId}`,
    evidence: [{ turnId: 'turn-1', turnOrdinal: 1, speaker: 'agent', text }],
    actionEvidence: [],
  };
}

describe('transcript evidence', () => {
  it('indexes only failed criterion evidence', () => {
    const failed = failedResult('result-1', 'criterion-1', 'quote a price');
    const passed = {
      ...failedResult('result-2', 'criterion-2', 'ignored'),
      result: 'pass' as const,
    };
    const annotations = buildTurnAnnotations([failed, passed]);

    expect(annotations.get('turn-1')).toHaveLength(1);
    expect(findAnnotation(annotations, 'criterion:result-1:turn-1')).toMatchObject({
      criterionId: 'criterion-1',
      text: 'quote a price',
    });
  });

  it('preserves transcript text while turning evidence into selectable segments', () => {
    const annotations = buildTurnAnnotations([
      failedResult('result-1', 'criterion-1', 'quoted 2400 rupees'),
    ]);
    const segments = segmentsForTurn(
      annotations,
      null,
      'turn-1',
      'The agent quoted 2400 rupees without checking.',
    );

    expect(segments.map(({ text }) => text).join('')).toBe(
      'The agent quoted 2400 rupees without checking.',
    );
    expect(segments).toContainEqual({
      text: 'quoted 2400 rupees',
      annotationKey: 'criterion:result-1:turn-1',
    });
  });

  it('keeps the selected evidence when overlapping excerpts start together', () => {
    const annotations = buildTurnAnnotations([
      failedResult('result-1', 'criterion-1', 'quoted 2400'),
      failedResult('result-2', 'criterion-2', 'quoted 2400 rupees'),
    ]);
    const segments = segmentsForTurn(
      annotations,
      'criterion:result-2:turn-1',
      'turn-1',
      'quoted 2400 rupees',
    );

    expect(segments).toEqual([
      { text: 'quoted 2400 rupees', annotationKey: 'criterion:result-2:turn-1' },
    ]);
  });
});
