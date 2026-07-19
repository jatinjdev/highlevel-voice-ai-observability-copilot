import {
  appSessions,
  companies,
  locations,
  marketplaceInstallations,
  marketplaceUsers,
} from '@copilot/database';
import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import CryptoJS from 'crypto-js';
import { and, eq, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

import type { Environment } from '../config/environment.schema';
import { DatabaseService } from '../database/database.service';

const SESSION_TTL_MS = 15 * 60_000;

const userContextSchema = z.object({
  userId: z.string().min(1),
  companyId: z.string().min(1),
  activeLocation: z.string().min(1),
  role: z.string().optional(),
  type: z.string().optional(),
  userName: z.string().optional(),
  email: z.email().optional(),
  appStatus: z.string().optional(),
});

export interface MarketplaceSessionResponse {
  token: string;
  expiresAt: string;
  user: { name: string | null };
  locationId: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly databaseService: DatabaseService,
  ) {}

  async exchange(encryptedData: string): Promise<MarketplaceSessionResponse> {
    const sharedSecret = this.configService.get('HIGHLEVEL_APP_SHARED_SECRET', { infer: true });
    if (!sharedSecret) {
      throw new ServiceUnavailableException('HighLevel signed user context is not configured.');
    }

    const parsedContext = userContextSchema.safeParse(
      decryptUserContext(encryptedData, sharedSecret),
    );
    if (!parsedContext.success) {
      throw new UnauthorizedException('HighLevel user context is invalid.');
    }
    const context = parsedContext.data;
    const [activeInstallation] = await this.databaseService.client
      .select({ id: marketplaceInstallations.id })
      .from(marketplaceInstallations)
      .where(
        and(
          eq(marketplaceInstallations.locationId, context.activeLocation),
          isNull(marketplaceInstallations.uninstalledAt),
        ),
      )
      .limit(1);
    if (!activeInstallation) {
      throw new ForbiddenException(
        'This location does not have an active Marketplace installation.',
      );
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.databaseService.client.transaction(async (transaction) => {
      const now = new Date();
      const [company] = await transaction
        .insert(companies)
        .values({ highLevelCompanyId: context.companyId, updatedAt: now })
        .onConflictDoUpdate({
          target: companies.highLevelCompanyId,
          set: { updatedAt: now },
        })
        .returning({ id: companies.id });
      if (!company) throw new Error('Session company upsert did not return a record.');

      const [location] = await transaction
        .insert(locations)
        .values({
          highLevelLocationId: context.activeLocation,
          companyId: company.id,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: locations.highLevelLocationId,
          set: { companyId: company.id, updatedAt: now },
        })
        .returning({ id: locations.id });
      if (!location) throw new Error('Session location upsert did not return a record.');

      const [user] = await transaction
        .insert(marketplaceUsers)
        .values({
          highLevelUserId: context.userId,
          companyId: company.id,
          name: context.userName,
          email: context.email,
          role: context.role,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: marketplaceUsers.highLevelUserId,
          set: {
            companyId: company.id,
            name: context.userName,
            email: context.email,
            role: context.role,
            updatedAt: now,
          },
        })
        .returning({ id: marketplaceUsers.id });
      if (!user) throw new Error('Session user upsert did not return a record.');

      await transaction.insert(appSessions).values({
        tokenHash,
        userId: user.id,
        locationId: location.id,
        expiresAt,
      });
    });

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: { name: context.userName ?? null },
      locationId: context.activeLocation,
    };
  }
}

export function decryptUserContext(encryptedData: string, sharedSecret: string): unknown {
  try {
    const plaintext = CryptoJS.AES.decrypt(encryptedData, sharedSecret).toString(CryptoJS.enc.Utf8);
    if (!plaintext) throw new Error('Decryption produced no plaintext.');
    return JSON.parse(plaintext) as unknown;
  } catch {
    throw new UnauthorizedException('HighLevel user context could not be decrypted.');
  }
}
