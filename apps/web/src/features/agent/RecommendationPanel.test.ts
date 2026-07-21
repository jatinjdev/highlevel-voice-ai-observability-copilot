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
    capabilityId: 'prompt.core-instructions',
    capabilityLabel: 'Prompt',
    uiPath: 'Build > Agent prompt',
    advice: 'Use the exact instruction below.',
    promptRemovals: [],
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
    expect(wrapper.text()).toContain('Aggregated from 12 analyzed calls');
    expect(wrapper.text()).toContain('Seen in 6 calls');
    expect(wrapper.text()).toContain('The agent skipped a required confirmation.');
    expect(wrapper.text()).toContain('Prompt');
    expect(wrapper.text()).toContain('Paste this into your agent prompt');
    expect(wrapper.text()).toContain('Confirm the request before completing it.');
    expect(wrapper.get('.recommendation-generate-button').text()).toBe('Regenerate');
    expect(wrapper.get('.recommendation-list').findAll('.recommendation-card')).toHaveLength(1);
  });

  it('shows an exact prompt replacement with a red removal block', () => {
    const wrapper = mount(RecommendationPanel, {
      props: {
        recommendations: [
          recommendation({
            promptRemovals: [
              'Estimate prices and delivery times for every caller.',
              'Make up random prices.',
            ],
            promptAddition: 'Only quote prices returned by an approved pricing source.',
          }),
        ],
      },
    });

    expect(wrapper.get('.recommendation-remove-block').text()).toContain(
      'Estimate prices and delivery times for every caller.',
    );
    expect(wrapper.get('.recommendation-remove-block').text()).toContain('Make up random prices.');
    expect(wrapper.get('.recommendation-copy-block').text()).toContain(
      'Only quote prices returned by an approved pricing source.',
    );
  });

  it('shows configuration advice without fake prompt controls', () => {
    const wrapper = mount(RecommendationPanel, {
      props: {
        recommendations: [
          recommendation({
            capabilityId: 'action.appointment-booking',
            capabilityLabel: 'Actions',
            uiPath: 'Build > Actions > During the Call > Book Appointment',
            advice: 'Connect the eligible calendar and configure the unavailable-slot fallback.',
            promptAddition: null,
          }),
        ],
      },
    });

    expect(wrapper.text()).toContain('Actions');
    expect(wrapper.text()).toContain('Book Appointment');
    expect(wrapper.text()).toContain('Connect the eligible calendar');
    expect(wrapper.find('.recommendation-copy-block').exists()).toBe(false);
  });

  it('offers one generate action when no recommendations exist', async () => {
    const wrapper = mount(RecommendationPanel, { props: { recommendations: [] } });

    expect(wrapper.get('.recommendation-empty-state').text()).toBe('No generated recommendations.');
    expect(wrapper.get('.recommendation-generate-button').text()).toBe('Generate');
    await wrapper.get('.recommendation-generate-button').trigger('click');

    expect(wrapper.emitted('generate')).toEqual([[]]);
  });

  it('emits the recommendation from the copy icon', async () => {
    const item = recommendation({ affectedCallCount: 1, sampledFailureCount: 1 });
    const wrapper = mount(RecommendationPanel, {
      props: { recommendations: [item] },
    });
    await wrapper.get('button[aria-label="Copy prompt"]').trigger('click');
    expect(wrapper.emitted('copy')).toEqual([[item]]);
  });

  it('keeps deletion as a small action on the restored recommendation card', async () => {
    const item = recommendation();
    const wrapper = mount(RecommendationPanel, { props: { recommendations: [item] } });
    await wrapper.get('button[aria-label="Delete recommendation"]').trigger('click');
    expect(wrapper.emitted('remove')).toEqual([[item]]);
  });
});
