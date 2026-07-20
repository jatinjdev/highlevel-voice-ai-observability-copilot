import type { Recommendation } from '@copilot/contracts';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import RecommendationPanel from './RecommendationPanel.vue';

function recommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: crypto.randomUUID(),
    criterionId: crypto.randomUUID(),
    criterionName: 'Confirm before completion',
    headline: 'Clarify the call flow',
    explanation: 'The agent skipped a required confirmation.',
    promptAddition: 'Confirm the request before completing it.',
    affectedCallCount: 6,
    sampledFailureCount: 6,
    generatedAt: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('RecommendationPanel', () => {
  it('shows a paste-ready aggregate recommendation', () => {
    const wrapper = mount(RecommendationPanel, {
      props: { analyzedCallCount: 12, recommendations: [recommendation()] },
    });
    expect(wrapper.text()).toContain('AI recommendations');
    expect(wrapper.text()).toContain('Patterns across 12 analyzed calls');
    expect(wrapper.text()).toContain('6 failed calls · 6 reviewed');
    expect(wrapper.text()).toContain('The agent skipped a required confirmation.');
    expect(wrapper.text()).toContain('Copy and paste into your agent prompt');
    expect(wrapper.text()).toContain('Confirm the request before completing it.');
  });

  it('emits the recommendation from the copy icon', async () => {
    const item = recommendation({ affectedCallCount: 1, sampledFailureCount: 1 });
    const wrapper = mount(RecommendationPanel, {
      props: { recommendations: [item] },
    });
    await wrapper.get('button[aria-label="Copy prompt change"]').trigger('click');
    expect(wrapper.emitted('copy')).toEqual([[item]]);
  });
});
