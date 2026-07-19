import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';
import {
  companies,
  installationLocationGrants,
  locations,
  marketplaceAppInstallations,
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
        const installation = await this.upsertInstallation(
          transaction,
          input.supportedWebhook,
          company?.id,
          now,
        );

        if (location) {
          await transaction
            .insert(installationLocationGrants)
            .values({
              installationId: installation.id,
              locationId: location.id,
              status: input.supportedWebhook.type === 'UNINSTALL' ? 'revoked' : 'active',
              revokedAt: input.supportedWebhook.type === 'UNINSTALL' ? now : null,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: [
                installationLocationGrants.installationId,
                installationLocationGrants.locationId,
              ],
              set: {
                status: input.supportedWebhook.type === 'UNINSTALL' ? 'revoked' : 'active',
                revokedAt: input.supportedWebhook.type === 'UNINSTALL' ? now : null,
                updatedAt: now,
              },
            });
        }

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

        const lifecycleAction =
          input.supportedWebhook.type === 'INSTALL'
            ? 'installed'
            : input.supportedWebhook.type === 'UPDATE'
              ? 'updated'
              : 'uninstalled';
        await transaction.insert(messageOutbox).values({
          sourceInboxId: inbox.id,
          eventType: `marketplace.installation.${lifecycleAction}`,
          aggregateType: 'marketplace_installation',
          aggregateId: installation.id,
          correlationId: inbox.id,
          companyId: company?.id,
          locationId: location?.id,
          payload: { installationId: installation.id },
        });
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

  private async upsertInstallation(
    transaction: Parameters<Parameters<DatabaseService['client']['transaction']>[0]>[0],
    webhook: Extract<SupportedHighLevelWebhook, { type: 'INSTALL' | 'UPDATE' | 'UNINSTALL' }>,
    companyId: string | undefined,
    now: Date,
  ) {
    const subjectType = webhook.locationId ? 'Location' : 'Company';
    const subjectExternalId = webhook.locationId ?? webhook.companyId!;
    const installationKey = `${webhook.appId}:${subjectType}:${subjectExternalId}`;
    const uninstalled = webhook.type === 'UNINSTALL';
    const [installation] = await transaction
      .insert(marketplaceAppInstallations)
      .values({
        installationKey,
        appId: webhook.appId,
        subjectType,
        subjectExternalId,
        companyId,
        installerUserId: typeof webhook.userId === 'string' ? webhook.userId : undefined,
        status: uninstalled ? 'uninstalled' : 'active',
        installedAt: uninstalled ? null : now,
        uninstalledAt: uninstalled ? now : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: marketplaceAppInstallations.installationKey,
        set: {
          ...(companyId ? { companyId } : {}),
          ...(typeof webhook.userId === 'string' ? { installerUserId: webhook.userId } : {}),
          status: uninstalled ? 'uninstalled' : 'active',
          ...(webhook.type === 'INSTALL' ? { installedAt: now } : {}),
          uninstalledAt: uninstalled ? now : null,
          updatedAt: now,
        },
      })
      .returning({ id: marketplaceAppInstallations.id });
    if (!installation) throw new Error('Installation upsert did not return a record.');
    return installation;
  }
}
