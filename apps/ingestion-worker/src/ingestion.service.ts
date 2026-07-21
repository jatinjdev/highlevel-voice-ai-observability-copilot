import type { CallIngestionRequestedEvent } from '@copilot/contracts';
import {
  callActionEvents,
  callTurns,
  locations,
  messageOutbox,
  processedMessages,
  voiceAgents,
  voiceAgentConfigurations,
  voiceCalls,
  webhookInbox,
} from '@copilot/database';
import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { WorkerDatabaseService } from './database.service';
import { voiceCallEndPayloadSchema } from './voice-call-payload';

const CONSUMER_NAME = 'ingestion-worker-v1';

@Injectable()
export class IngestionService {
  constructor(private readonly databaseService: WorkerDatabaseService) {}

  async ingestCall(event: CallIngestionRequestedEvent): Promise<'processed' | 'duplicate'> {
    const locationId = event.tenant.locationId;
    if (!locationId) throw new Error('Call ingestion event has no location tenant.');

    const [[inbox], [location]] = await Promise.all([
      this.databaseService.client
        .select({ payload: webhookInbox.payload })
        .from(webhookInbox)
        .where(eq(webhookInbox.id, event.data.webhookInboxId))
        .limit(1),
      this.databaseService.client
        .select({ id: locations.id, highLevelLocationId: locations.highLevelLocationId })
        .from(locations)
        .where(eq(locations.id, locationId))
        .limit(1),
    ]);
    if (!inbox) throw new Error(`Webhook inbox ${event.data.webhookInboxId} does not exist.`);
    if (!location) throw new Error(`Tenant location ${locationId} does not exist.`);

    const payload = voiceCallEndPayloadSchema.parse(inbox.payload);
    if (payload.id !== event.data.highLevelCallId) {
      throw new Error('Queue call ID does not match the durable webhook payload.');
    }
    if (payload.locationId !== location.highLevelLocationId) {
      throw new Error('Webhook location does not match the queue tenant.');
    }

    return this.databaseService.client.transaction(async (transaction) => {
      const [claim] = await transaction
        .insert(processedMessages)
        .values({ consumerName: CONSUMER_NAME, messageId: event.messageId })
        .onConflictDoNothing({
          target: [processedMessages.consumerName, processedMessages.messageId],
        })
        .returning({ id: processedMessages.id });
      if (!claim) return 'duplicate';

      const [agent] = await transaction
        .insert(voiceAgents)
        .values({
          locationId: location.id,
          highLevelAgentId: payload.agentId,
          name: 'Voice AI agent',
        })
        .onConflictDoUpdate({
          target: [voiceAgents.locationId, voiceAgents.highLevelAgentId],
          set: { updatedAt: new Date() },
        })
        .returning({ id: voiceAgents.id });
      if (!agent) throw new Error(`Agent ${payload.agentId} could not be persisted.`);

      await transaction
        .insert(voiceAgentConfigurations)
        .values({ agentId: agent.id })
        .onConflictDoNothing({ target: voiceAgentConfigurations.agentId });

      const [call] = await transaction
        .insert(voiceCalls)
        .values({
          agentId: agent.id,
          locationId: location.id,
          sourceWebhookInboxId: event.data.webhookInboxId,
          highLevelCallId: payload.id,
          contactId: payload.contactId,
          sourceTranscript: payload.transcript,
          sourceSummary: payload.summary,
          extractedData: payload.extractedData,
          durationSeconds: Math.round(payload.duration),
          isTrial: payload.trialCall,
          callCreatedAt: new Date(payload.createdAt),
        })
        .onConflictDoUpdate({
          target: [voiceCalls.locationId, voiceCalls.highLevelCallId],
          set: {
            agentId: agent.id,
            sourceWebhookInboxId: event.data.webhookInboxId,
            contactId: payload.contactId,
            sourceTranscript: payload.transcript,
            sourceSummary: payload.summary,
            extractedData: payload.extractedData,
            durationSeconds: Math.round(payload.duration),
            isTrial: payload.trialCall,
            callCreatedAt: new Date(payload.createdAt),
            ingestedAt: new Date(),
          },
        })
        .returning({ id: voiceCalls.id });
      if (!call) throw new Error(`Call ${payload.id} could not be persisted.`);

      await transaction.delete(callTurns).where(eq(callTurns.callId, call.id));
      const turns = parseTranscript(payload.transcript);
      if (turns.length) {
        await transaction.insert(callTurns).values(
          turns.map((turn, index) => ({
            callId: call.id,
            ordinal: index + 1,
            speaker: turn.speaker,
            text: turn.text,
          })),
        );
      }

      await transaction.delete(callActionEvents).where(eq(callActionEvents.callId, call.id));
      const actionEvents = payload.executedCallActions.map(toActionEvent);
      if (actionEvents.length) {
        await transaction.insert(callActionEvents).values(
          actionEvents.map((action, index) => ({
            callId: call.id,
            ordinal: index + 1,
            ...action,
          })),
        );
      }

      await transaction
        .insert(messageOutbox)
        .values({
          sourceInboxId: event.data.webhookInboxId,
          eventType: 'call.analysis.requested',
          aggregateType: 'call',
          aggregateId: call.id,
          correlationId: event.correlationId,
          causationId: event.messageId,
          companyId: event.tenant.companyId,
          locationId,
          payload: { callId: call.id, agentId: agent.id },
        })
        .onConflictDoNothing({
          target: [messageOutbox.sourceInboxId, messageOutbox.eventType],
        });

      return 'processed';
    });
  }

  async hasProcessed(messageId: string): Promise<boolean> {
    const [record] = await this.databaseService.client
      .select({ id: processedMessages.id })
      .from(processedMessages)
      .where(
        and(
          eq(processedMessages.consumerName, CONSUMER_NAME),
          eq(processedMessages.messageId, messageId),
        ),
      )
      .limit(1);
    return Boolean(record);
  }
}

export function parseTranscript(transcript: string): Array<{
  speaker: 'agent' | 'customer' | 'unknown';
  text: string;
}> {
  const turns: Array<{ speaker: 'agent' | 'customer' | 'unknown'; text: string }> = [];

  for (const raw of transcript.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const match = line.match(/^([^:]+):\s*(.*)$/);
    const label = match?.[1]?.trim().toLowerCase() ?? '';
    const speaker = /^(bot|agent|assistant|ai)$/.test(label)
      ? ('agent' as const)
      : /^(human|customer|caller|user)$/.test(label)
        ? ('customer' as const)
        : null;

    if (speaker) {
      const text = match?.[2]?.trim() ?? '';
      if (text) turns.push({ speaker, text });
      continue;
    }

    if (!match && turns.length > 0) {
      const previous = turns.at(-1)!;
      previous.text = `${previous.text}\n${line}`;
      continue;
    }

    turns.push({ speaker: 'unknown', text: match?.[2]?.trim() || line });
  }

  return turns;
}

function toActionEvent(action: unknown): {
  highLevelActionId: string | null;
  actionType: string | null;
  actionName: string | null;
  outcome: string | null;
  resultSummary: Record<string, unknown>;
  sourceOccurredAt: Date | null;
} {
  if (!action || typeof action !== 'object') {
    return {
      highLevelActionId: null,
      actionType: null,
      actionName: null,
      outcome: null,
      resultSummary: { raw: action },
      sourceOccurredAt: null,
    };
  }
  const record = action as Record<string, unknown>;
  const occurredAt = readDate(record.executedAt ?? record.occurredAt);
  return {
    highLevelActionId: readString(record.id ?? record.actionId),
    actionType: readString(record.actionType ?? record.type),
    actionName: readString(record.actionName ?? record.name),
    outcome: readString(record.outcome ?? record.status),
    resultSummary: record,
    sourceOccurredAt: occurredAt,
  };
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
