import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { demoAgentFixtureSchema, loadDemoAgentFixture } from './demo-agent.fixture';

const fixturePath = resolve(process.cwd(), 'fixtures/demo-agent.json');

describe('demo agent fixture', () => {
  it('defines a reproducible agent, calls, checks, and expected recommendations', async () => {
    const fixture = await loadDemoAgentFixture(fixturePath);

    expect(fixture.criteria).toHaveLength(7);
    expect(fixture.calls).toHaveLength(12);
    expect(fixture.expectedRecommendations).toEqual(fixture.criteria.map(({ name }) => name));
    expect(fixture.prompt).not.toContain('allergen');
    expect(fixture.prompt).not.toContain('privacy');
    for (const criterionName of [
      'Collect order details',
      'Confirm order before action',
      'Confirm only after action success',
      'Keep business facts grounded',
      'Handle complaints responsibly',
    ]) {
      expect(
        fixture.calls.filter((call) => call.expectedResults[criterionName] === 'fail').length,
        `${criterionName} should demonstrate an aggregate pattern`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects an expected result that does not belong to the configured agent', async () => {
    const fixture = await loadDemoAgentFixture(fixturePath);
    fixture.calls[0]!.expectedResults['Missing criterion'] = 'fail';

    const result = demoAgentFixtureSchema.safeParse(fixture);

    expect(result.success).toBe(false);
  });
});
