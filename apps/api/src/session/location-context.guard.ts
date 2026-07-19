import { appSessions, locations } from '@copilot/database';
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { createHash } from 'node:crypto';

import type { Environment } from '../config/environment.schema';
import { DatabaseService } from '../database/database.service';
import type { LocationContextRequest } from './location-context';

@Injectable()
export class LocationContextGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly databaseService: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<LocationContextRequest>();
    const bearerToken = readBearerToken(request.headers.authorization);
    if (bearerToken) {
      const tokenHash = createHash('sha256').update(bearerToken).digest('hex');
      const [session] = await this.databaseService.client
        .select({
          userId: appSessions.userId,
          locationId: locations.highLevelLocationId,
        })
        .from(appSessions)
        .innerJoin(locations, eq(appSessions.locationId, locations.id))
        .where(
          and(
            eq(appSessions.tokenHash, tokenHash),
            isNull(appSessions.revokedAt),
            gt(appSessions.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!session) throw new UnauthorizedException('Marketplace session is invalid or expired.');
      request.locationContext = {
        locationId: session.locationId,
        userId: session.userId,
        source: 'marketplace_session',
      };
      return true;
    }

    const requestedLocation = request.query.locationId;
    const developmentLocationId = this.configService.get('SUB_ACCOUNT_LOCATION_ID', {
      infer: true,
    });
    if (
      this.configService.get('NODE_ENV', { infer: true }) !== 'production' &&
      ((typeof requestedLocation === 'string' && requestedLocation.trim()) || developmentLocationId)
    ) {
      request.locationContext = {
        locationId:
          typeof requestedLocation === 'string' && requestedLocation.trim()
            ? requestedLocation.trim()
            : developmentLocationId!,
        userId: null,
        source: 'development_query',
      };
      return true;
    }

    throw new UnauthorizedException('A valid HighLevel Marketplace session is required.');
  }
}

function readBearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, token, extra] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : null;
}
