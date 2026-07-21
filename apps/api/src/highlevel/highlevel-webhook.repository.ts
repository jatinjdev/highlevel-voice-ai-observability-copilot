import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import {
  companies,
  locations,
  marketplaceInstallations,
  messageOutbox,
  webhookInbox,
} from '../database/schema';
import type { HighLevelWebhook, SupportedHighLevelWebhook } from './highlevel-webhook.types';

export interface RecordWebhookInput {
  webhook: HighLevelWebhook;
  supportedWebhook: SupportedHighLevelWebhook | null;
  idempotencyKey: string;
  payloadSha256: string;
}

export interface RecordWebhookResult {
  handled: boolean;
  duplicate: boolean;
  inboxId?: string;
}

@Injectable()
export class HighLevelWebhookRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  record(input: RecordWebhookInput): Promise<RecordWebhookResult> {
    return this.databaseService.client.transaction(async (transaction) => {
      const [inbox] = await transaction
        .insert(webhookInbox)
        .values({
          idempotencyKey: input.idempotencyKey,
          appId: input.webhook.appId,
          webhookId: input.webhook.webhookId,
          eventType: input.webhook.type,
          payloadSha256: input.payloadSha256,
          payload: input.webhook,
        })
        .onConflictDoNothing({ target: webhookInbox.idempotencyKey })
        .returning({ id: webhookInbox.id });

      if (!inbox) return { handled: input.supportedWebhook !== null, duplicate: true };

      if (!input.supportedWebhook) {
        await transaction
          .update(webhookInbox)
          .set({ status: 'ignored', processedAt: new Date() })
          .where(eq(webhookInbox.id, inbox.id));
        return { handled: false, duplicate: false, inboxId: inbox.id };
      }

      const now = new Date();
      const company = input.supportedWebhook.companyId
        ? await this.upsertCompany(transaction, input.supportedWebhook.companyId, now)
        : undefined;
      const location = input.supportedWebhook.locationId
        ? await this.upsertLocation(
            transaction,
            input.supportedWebhook.locationId,
            company?.id,
            now,
          )
        : undefined;

      if (input.supportedWebhook.type === 'VoiceAiCallEnd') {
        if (!location) throw new Error('Validated call webhook did not resolve a location.');
        await transaction.insert(messageOutbox).values({
          sourceInboxId: inbox.id,
          eventType: 'call.ingestion.requested',
          aggregateType: 'call',
          aggregateId: inbox.id,
          correlationId: inbox.id,
          companyId: company?.id,
          locationId: location.id,
          payload: {
            webhookInboxId: inbox.id,
            highLevelCallId: input.supportedWebhook.id,
          },
        });
      } else {
        if (input.supportedWebhook.type === 'UNINSTALL') {
          await transaction
            .update(marketplaceInstallations)
            .set({ uninstalledAt: now, updatedAt: now })
            .where(
              input.supportedWebhook.locationId
                ? eq(marketplaceInstallations.locationId, input.supportedWebhook.locationId)
                : eq(marketplaceInstallations.companyId, input.supportedWebhook.companyId!),
            );
        }
      }

      await transaction
        .update(webhookInbox)
        .set({ status: 'accepted', processedAt: now })
        .where(eq(webhookInbox.id, inbox.id));

      return { handled: true, duplicate: false, inboxId: inbox.id };
    });
  }

  private async upsertCompany(
    transaction: Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0],
    highLevelCompanyId: string,
    now: Date,
  ) {
    const [company] = await transaction
      .insert(companies)
      .values({ highLevelCompanyId, updatedAt: now })
      .onConflictDoUpdate({
        target: companies.highLevelCompanyId,
        set: { updatedAt: now },
      })
      .returning({ id: companies.id });
    if (!company) throw new Error('Company upsert did not return a record.');
    return company;
  }

  private async upsertLocation(
    transaction: Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0],
    highLevelLocationId: string,
    companyId: string | undefined,
    now: Date,
  ) {
    const [location] = await transaction
      .insert(locations)
      .values({ highLevelLocationId, companyId, updatedAt: now })
      .onConflictDoUpdate({
        target: locations.highLevelLocationId,
        set: {
          ...(companyId ? { companyId } : {}),
          updatedAt: now,
        },
      })
      .returning({ id: locations.id });
    if (!location) throw new Error('Location upsert did not return a record.');
    return location;
  }
}
