import type { Recommendation } from '@copilot/contracts';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import RecommendationPanel from './RecommendationPanel.vue';

function recommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: crypto.randomUUID(),
    scope: 'agent',
    criterionId: crypto.randomUUID(),
    criterionVersionId: crypto.randomUUID(),
    supportingCallCount: 6,
    targetId: 'prompt.core-instructions',
    type: 'prompt',
    title: 'Clarify the call flow',
    reason: 'The agent skipped a required confirmation.',
    proposedChange: 'Require confirmation before completing the request.',
    uiPath: 'Build > Agent prompt',
    evidenceTurnIds: [],
    ...overrides,
  };
}

describe('RecommendationPanel', () => {
  it('shows a paste-ready aggregate recommendation', () => {
    const wrapper = mount(RecommendationPanel, {
      props: { scope: 'agent', analyzedCallCount: 12, recommendations: [recommendation()] },
    });
    expect(wrapper.text()).toContain('Patterns across 12 analyzed calls');
    expect(wrapper.text()).toContain('Seen in 6 calls');
    expect(wrapper.text()).toContain('The agent skipped a required confirmation.');
    expect(wrapper.text()).toContain('Copy and paste into your agent prompt');
    expect(wrapper.text()).toContain('Require confirmation before completing the request.');
  });

  it('emits the recommendation from the copy icon', async () => {
    const item = recommendation({ scope: 'call', supportingCallCount: 1 });
    const wrapper = mount(RecommendationPanel, {
      props: { scope: 'call', recommendations: [item] },
    });
    await wrapper.get('button[aria-label="Copy prompt change"]').trigger('click');
    expect(wrapper.emitted('copy')).toEqual([[item]]);
  });
});
