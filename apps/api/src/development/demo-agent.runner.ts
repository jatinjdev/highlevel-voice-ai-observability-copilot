import type { DemoAgentFixture } from './demo-agent.fixture';
import type { DemoAgentContext, DemoAgentStore, DemoVerificationReport } from './demo-agent.store';

export type DemoCommand = 'seed' | 'analyze' | 'recommend' | 'verify';

interface CallAnalysisQueue {
  analyzeCall(locationId: string, callId: string): Promise<unknown>;
}

interface RecommendationQueue {
  generateAll(locationId: string, agentId: string): Promise<{ criterionIds: string[] }>;
}

type DemoStore = Pick<DemoAgentStore, 'seed' | 'load' | 'verify'>;

export type DemoCommandResult =
  | {
      command: 'seed';
      fixture: string;
      agentId: string;
      criteria: number;
      calls: number;
      analysisQueued: 0;
    }
  | { command: 'analyze'; fixture: string; queuedCalls: number }
  | { command: 'recommend'; fixture: string; queuedCriteria: string[] }
  | DemoVerificationReport;

/**
 * Runs demo jobs through the same command services used by the HTTP API.
 * Only fixture seeding is demo-specific; evaluation and recommendation
 * generation retain their production idempotency and queue behavior.
 */
export class DemoAgentRunner {
  constructor(
    private readonly store: DemoStore,
    private readonly callAnalysisQueue: CallAnalysisQueue,
    private readonly recommendationQueue: RecommendationQueue,
  ) {}

  async run(
    command: DemoCommand,
    fixture: DemoAgentFixture,
    locationId: string,
  ): Promise<DemoCommandResult> {
    if (command === 'seed') {
      const context = await this.store.seed(fixture, locationId);
      return {
        command,
        fixture: fixture.key,
        agentId: context.agentId,
        criteria: context.criteria.length,
        calls: context.callIds.length,
        analysisQueued: 0,
      };
    }

    const context = await this.store.load(fixture, locationId);
    if (command === 'analyze') return this.analyze(fixture, locationId, context);
    if (command === 'recommend') return this.recommend(fixture, locationId, context);
    return this.store.verify(fixture, locationId);
  }

  private async analyze(
    fixture: DemoAgentFixture,
    locationId: string,
    context: DemoAgentContext,
  ): Promise<DemoCommandResult> {
    for (const callId of context.callIds) {
      await this.callAnalysisQueue.analyzeCall(locationId, callId);
    }
    return { command: 'analyze', fixture: fixture.key, queuedCalls: context.callIds.length };
  }

  private async recommend(
    fixture: DemoAgentFixture,
    locationId: string,
    context: DemoAgentContext,
  ): Promise<DemoCommandResult> {
    const result = await this.recommendationQueue.generateAll(locationId, context.agentId);
    const queuedIds = new Set(result.criterionIds);
    return {
      command: 'recommend',
      fixture: fixture.key,
      queuedCriteria: context.criteria
        .filter(({ id }) => queuedIds.has(id))
        .map(({ name }) => name),
    };
  }
}
