import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { loadDemoAgentFixture } from './demo-agent.fixture';
import { DemoAgentRunner } from './demo-agent.runner';

const fixturePath = resolve(process.cwd(), 'fixtures/demo-agent.json');
const context = {
  agentId: '3a3cadf8-017b-467d-8f8a-79d7c23a4191',
  callIds: ['67cce9a5-6c9e-4c7c-9a5c-2f48660b906c', '84a0f49d-3269-4bda-a90d-cc002ab5776d'],
  criteria: [{ id: '7082c278-9c6f-4c3a-8fbf-d4a03e5fcf96', name: 'Collect order details' }],
};

function setup() {
  const store = {
    seed: vi.fn().mockResolvedValue(context),
    load: vi.fn().mockResolvedValue(context),
    verify: vi.fn().mockResolvedValue({ passed: true, checks: [] }),
  };
  const callAnalysisQueue = { analyzeCall: vi.fn().mockResolvedValue({ status: 'queued' }) };
  const recommendationQueue = {
    generateAll: vi.fn().mockResolvedValue({ criterionIds: context.criteria.map(({ id }) => id) }),
  };
  return {
    store,
    callAnalysisQueue,
    recommendationQueue,
    runner: new DemoAgentRunner(store, callAnalysisQueue, recommendationQueue),
  };
}

describe('DemoAgentRunner', () => {
  it('seeds canonical demo data without implicitly invoking analysis', async () => {
    const fixture = await loadDemoAgentFixture(fixturePath);
    const { runner, store, callAnalysisQueue, recommendationQueue } = setup();

    const result = await runner.run('seed', fixture, 'location-1');

    expect(store.seed).toHaveBeenCalledWith(fixture, 'location-1');
    expect(callAnalysisQueue.analyzeCall).not.toHaveBeenCalled();
    expect(recommendationQueue.generateAll).not.toHaveBeenCalled();
    expect(result).toMatchObject({ command: 'seed', calls: 2, analysisQueued: 0 });
  });

  it('queues every configured call through the production call-analysis command', async () => {
    const fixture = await loadDemoAgentFixture(fixturePath);
    const { runner, callAnalysisQueue } = setup();

    await runner.run('analyze', fixture, 'location-1');

    expect(callAnalysisQueue.analyzeCall.mock.calls).toEqual([
      ['location-1', context.callIds[0]],
      ['location-1', context.callIds[1]],
    ]);
  });

  it('uses the production agent-level recommendation batch command', async () => {
    const fixture = await loadDemoAgentFixture(fixturePath);
    const { runner, recommendationQueue } = setup();

    await runner.run('recommend', fixture, 'location-1');

    expect(recommendationQueue.generateAll).toHaveBeenCalledOnce();
    expect(recommendationQueue.generateAll).toHaveBeenCalledWith('location-1', context.agentId);
  });
});
