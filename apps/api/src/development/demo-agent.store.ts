import { normalizeCriterionName } from '@copilot/contracts';
import {
  agentRecommendations,
  callActionEvents,
  callAnalysisRuns,
  callTurns,
  criterionResults,
  locations,
  successCriteria,
  voiceAgentConfigurations,
  voiceAgents,
  voiceCalls,
} from '@copilot/database';
import { and, eq, inArray } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import { DatabaseService } from '../database/database.service';
import { hashAgentConfiguration } from '../pipeline/agent-configuration';
import type { DemoAgentFixture } from './demo-agent.fixture';

export interface DemoAgentContext {
  agentId: string;
  callIds: string[];
  criteria: Array<{ id: string; name: string }>;
}

export interface DemoVerificationCheck {
  subject: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface DemoVerificationReport {
  passed: boolean;
  checks: DemoVerificationCheck[];
}

/**
 * Owns the one deliberate seam between committed demo data and production data.
 * It writes canonical rows directly; analysis and recommendations are queued by
 * the same command modules used by the dashboard.
 */
export class DemoAgentStore {
  constructor(private readonly databaseService: DatabaseService) {}

  async seed(fixture: DemoAgentFixture, highLevelLocationId: string): Promise<DemoAgentContext> {
    return this.databaseService.client.transaction(async (transaction) => {
      const [location] = await transaction
        .insert(locations)
        .values({ highLevelLocationId })
        .onConflictDoUpdate({
          target: locations.highLevelLocationId,
          set: { updatedAt: new Date() },
        })
        .returning({ id: locations.id });
      if (!location) throw new Error('Could not resolve the demo Location.');

      const externalAgentId = demoAgentExternalId(fixture);
      const [agent] = await transaction
        .insert(voiceAgents)
        .values({
          locationId: location.id,
          highLevelAgentId: externalAgentId,
          name: fixture.name,
          source: 'demo',
        })
        .onConflictDoUpdate({
          target: [voiceAgents.locationId, voiceAgents.highLevelAgentId],
          set: {
            name: fixture.name,
            source: 'demo',
            lifecycleState: 'active',
            updatedAt: new Date(),
          },
        })
        .returning({ id: voiceAgents.id });
      if (!agent) throw new Error('Could not persist the demo Voice Agent.');

      await transaction.delete(voiceCalls).where(eq(voiceCalls.agentId, agent.id));
      await transaction.delete(successCriteria).where(eq(successCriteria.agentId, agent.id));

      const promptHash = createHash('sha256').update(fixture.prompt).digest('hex');
      const configuration = {
        source: 'demo_fixture',
        fixtureKey: fixture.key,
        schemaVersion: fixture.schemaVersion,
      };
      const configurationHash = hashAgentConfiguration(fixture.prompt, configuration);
      await transaction
        .insert(voiceAgentConfigurations)
        .values({
          agentId: agent.id,
          currentPrompt: fixture.prompt,
          promptHash,
          configuration,
          configurationHash,
          syncStatus: 'fixture',
          syncedAt: new Date(),
          criteriaInitializedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: voiceAgentConfigurations.agentId,
          set: {
            currentPrompt: fixture.prompt,
            promptHash,
            configuration,
            configurationHash,
            syncStatus: 'fixture',
            syncedAt: new Date(),
            criteriaInitializedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      const criteria = await transaction
        .insert(successCriteria)
        .values(
          fixture.criteria.map((criterion) => ({
            agentId: agent.id,
            name: criterion.name,
            normalizedName: normalizeCriterionName(criterion.name),
            description: criterion.description,
            source: 'user',
          })),
        )
        .returning({ id: successCriteria.id, name: successCriteria.name });

      const baseTime = Date.now() - fixture.calls.length * 5 * 60_000;
      const callIds: string[] = [];
      for (const [index, configuredCall] of fixture.calls.entries()) {
        const [call] = await transaction
          .insert(voiceCalls)
          .values({
            agentId: agent.id,
            locationId: location.id,
            highLevelCallId: demoCallExternalId(fixture, configuredCall.key),
            direction: 'inbound',
            sourceTranscript: configuredCall.transcript,
            sourceSummary: configuredCall.summary,
            durationSeconds: configuredCall.durationSeconds,
            extractedData: {
              demoFixture: {
                fixtureKey: fixture.key,
                callKey: configuredCall.key,
                scenarioName: configuredCall.name,
              },
            },
            isTrial: true,
            callCreatedAt: new Date(baseTime + index * 5 * 60_000),
          })
          .returning({ id: voiceCalls.id });
        if (!call) throw new Error(`Could not persist demo Call ${configuredCall.key}.`);
        callIds.push(call.id);

        const turns = parseTranscript(configuredCall.transcript);
        if (turns.length) {
          await transaction.insert(callTurns).values(
            turns.map((turn, turnIndex) => ({
              callId: call.id,
              ordinal: turnIndex + 1,
              ...turn,
            })),
          );
        }
        if (configuredCall.actions.length) {
          await transaction.insert(callActionEvents).values(
            configuredCall.actions.map((action, actionIndex) => ({
              callId: call.id,
              ordinal: actionIndex + 1,
              actionType: action.actionType,
              actionName: action.actionName,
              outcome: action.outcome,
              resultSummary: action.resultSummary,
            })),
          );
        }
      }

      return { agentId: agent.id, callIds, criteria };
    });
  }

  async load(fixture: DemoAgentFixture, highLevelLocationId: string): Promise<DemoAgentContext> {
    const [agent] = await this.databaseService.client
      .select({ id: voiceAgents.id })
      .from(voiceAgents)
      .innerJoin(locations, eq(locations.id, voiceAgents.locationId))
      .where(
        and(
          eq(locations.highLevelLocationId, highLevelLocationId),
          eq(voiceAgents.highLevelAgentId, demoAgentExternalId(fixture)),
          eq(voiceAgents.source, 'demo'),
        ),
      )
      .limit(1);
    if (!agent) throw new Error('Seed the configured demo Voice Agent before running jobs.');

    const [calls, criteria] = await Promise.all([
      this.databaseService.client
        .select({ id: voiceCalls.id })
        .from(voiceCalls)
        .where(eq(voiceCalls.agentId, agent.id)),
      this.databaseService.client
        .select({ id: successCriteria.id, name: successCriteria.name })
        .from(successCriteria)
        .where(eq(successCriteria.agentId, agent.id)),
    ]);
    return { agentId: agent.id, callIds: calls.map(({ id }) => id), criteria };
  }

  async verify(
    fixture: DemoAgentFixture,
    highLevelLocationId: string,
  ): Promise<DemoVerificationReport> {
    const context = await this.load(fixture, highLevelLocationId);
    const callExternalIds = fixture.calls.map((call) => demoCallExternalId(fixture, call.key));
    const results = await this.databaseService.client
      .select({
        callExternalId: voiceCalls.highLevelCallId,
        criterionName: successCriteria.name,
        result: criterionResults.result,
      })
      .from(voiceCalls)
      .innerJoin(
        callAnalysisRuns,
        and(eq(callAnalysisRuns.callId, voiceCalls.id), eq(callAnalysisRuns.isCurrent, true)),
      )
      .innerJoin(criterionResults, eq(criterionResults.analysisRunId, callAnalysisRuns.id))
      .innerJoin(successCriteria, eq(successCriteria.id, criterionResults.criterionId))
      .where(inArray(voiceCalls.highLevelCallId, callExternalIds));
    const actualResults = new Map(
      results.map((row) => [`${row.callExternalId}:${row.criterionName}`, row.result]),
    );

    const checks: DemoVerificationCheck[] = [];
    for (const call of fixture.calls) {
      const callExternalId = demoCallExternalId(fixture, call.key);
      for (const [criterionName, expected] of Object.entries(call.expectedResults)) {
        const actual = actualResults.get(`${callExternalId}:${criterionName}`) ?? 'missing';
        checks.push({
          subject: `${call.key} / ${criterionName}`,
          expected,
          actual,
          passed: actual === expected,
        });
      }
    }

    const recommendationRows = await this.databaseService.client
      .select({ criterionName: successCriteria.name })
      .from(agentRecommendations)
      .innerJoin(successCriteria, eq(successCriteria.id, agentRecommendations.criterionId))
      .where(eq(agentRecommendations.agentId, context.agentId));
    const actualRecommendations = new Set(
      recommendationRows.map(({ criterionName }) => criterionName),
    );
    const expectedRecommendations = new Set(fixture.expectedRecommendations);
    for (const criterion of fixture.criteria) {
      const expected = expectedRecommendations.has(criterion.name);
      const actual = actualRecommendations.has(criterion.name);
      checks.push({
        subject: `recommendation / ${criterion.name}`,
        expected: expected ? 'present' : 'absent',
        actual: actual ? 'present' : 'absent',
        passed: actual === expected,
      });
    }

    return { passed: checks.every(({ passed }) => passed), checks };
  }
}

export function demoAgentExternalId(fixture: DemoAgentFixture): string {
  return `demo-${fixture.key}`;
}

export function demoCallExternalId(fixture: DemoAgentFixture, callKey: string): string {
  return `demo-${fixture.key}-${callKey}`;
}

function parseTranscript(transcript: string): Array<{
  speaker: 'agent' | 'customer' | 'unknown';
  text: string;
}> {
  return transcript
    .split(/\r?\n/)
    .map((raw) => {
      const match = raw.match(/^\s*([^:]+):\s*(.*)$/);
      const label = match?.[1]?.trim().toLowerCase() ?? '';
      const text = (match?.[2] ?? raw).trim();
      const speaker = /^(bot|agent|assistant|ai)$/.test(label)
        ? ('agent' as const)
        : /^(human|customer|caller|user)$/.test(label)
          ? ('customer' as const)
          : ('unknown' as const);
      return { speaker, text };
    })
    .filter(({ text }) => text.length > 0);
}
