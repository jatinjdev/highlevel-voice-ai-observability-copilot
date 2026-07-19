import { describe, expect, it } from 'vitest';

import { compileUserCriterion } from './user-criterion-compiler';

describe('compileUserCriterion', () => {
  it('allows fallback prompt guidance for unsupported safety guarantees', () => {
    const criterion = compileUserCriterion(
      'For serious allergy questions, never guarantee that a product is allergen-free.',
    );

    expect(criterion.allowedRecommendationTargetIds).toContain('prompt.fallback-boundaries');
  });
});
