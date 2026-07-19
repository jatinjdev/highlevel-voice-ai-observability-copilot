import type { DomainEvent } from '@copilot/contracts';
import { domainEventSchema } from '@copilot/contracts';
import type { DomainEventPublisher } from '@copilot/messaging';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import type { Environment } from '../config/environment.schema';
import { DatabaseService } from '../database/database.service';
import { messageOutbox } from '../database/schema';
import { DOMAIN_EVENT_PUBLISHER } from './outbox.constants';

const POLL_INTERVAL_MS = 1_000;
const LEASE_DURATION_MS = 30_000;
const BATCH_SIZE = 10;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

type OutboxRecord = typeof messageOutbox.$inferSelect;

@Injectable()
export class OutboxPublisherService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly databaseService: DatabaseService,
    @Inject(DOMAIN_EVENT_PUBLISHER)
    private readonly publisher: DomainEventPublisher,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.configService.get('OUTBOX_PUBLISHER_ENABLED', { infer: true })) return;
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.timer.unref();
    void this.tick();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const records = await this.leaseBatch();
      await Promise.all(records.map((record) => this.publish(record)));
    } catch (error) {
      this.logger.error('Outbox polling failed.', error instanceof Error ? error.stack : undefined);
    } finally {
      this.running = false;
    }
  }

  private leaseBatch(): Promise<OutboxRecord[]> {
    return this.databaseService.client.transaction(async (transaction) => {
      const now = new Date();
      const records = await transaction
        .select()
        .from(messageOutbox)
        .where(
          and(
            isNull(messageOutbox.publishedAt),
            lte(messageOutbox.nextPublishAt, now),
            or(isNull(messageOutbox.leasedUntil), lte(messageOutbox.leasedUntil, now)),
          ),
        )
        .orderBy(asc(messageOutbox.occurredAt))
        .limit(BATCH_SIZE)
        .for('update', { skipLocked: true });
      if (records.length === 0) return [];

      const leaseToken = randomUUID();
      const leasedUntil = new Date(now.getTime() + LEASE_DURATION_MS);
      await transaction
        .update(messageOutbox)
        .set({ leaseToken, leasedUntil })
        .where(
          inArray(
            messageOutbox.id,
            records.map((record) => record.id),
          ),
        );
      return records.map((record) => ({ ...record, leaseToken, leasedUntil }));
    });
  }

  private async publish(record: OutboxRecord): Promise<void> {
    try {
      await this.publisher.publish(this.toDomainEvent(record));
      await this.databaseService.client
        .update(messageOutbox)
        .set({
          publishedAt: new Date(),
          leaseToken: null,
          leasedUntil: null,
          lastPublishError: null,
        })
        .where(
          and(eq(messageOutbox.id, record.id), eq(messageOutbox.leaseToken, record.leaseToken!)),
        );
    } catch (error) {
      const attempts = record.publishAttempts + 1;
      const retryDelay = Math.min(2 ** Math.min(attempts, 8) * 1_000, MAX_RETRY_DELAY_MS);
      const message = error instanceof Error ? error.message : 'Unknown outbox publish failure.';
      await this.databaseService.client
        .update(messageOutbox)
        .set({
          publishAttempts: attempts,
          nextPublishAt: new Date(Date.now() + retryDelay),
          leaseToken: null,
          leasedUntil: null,
          lastPublishError: message.slice(0, 2_000),
        })
        .where(
          and(eq(messageOutbox.id, record.id), eq(messageOutbox.leaseToken, record.leaseToken!)),
        );
      this.logger.warn(`Outbox message ${record.id} publish failed; retry ${attempts} scheduled.`);
    }
  }

  private toDomainEvent(record: OutboxRecord): DomainEvent {
    return domainEventSchema.parse({
      type: record.eventType,
      version: record.schemaVersion,
      messageId: record.id,
      correlationId: record.correlationId,
      causationId: record.causationId,
      occurredAt: record.occurredAt.toISOString(),
      tenant: {
        companyId: record.companyId,
        locationId: record.locationId,
      },
      data: record.payload,
    });
  }
}
