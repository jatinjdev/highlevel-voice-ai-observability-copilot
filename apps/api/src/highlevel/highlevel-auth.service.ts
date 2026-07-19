import type { HighLevelAuthStatus } from '@copilot/contracts';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { Environment } from '../config/environment.schema';
import { DatabaseService } from '../database/database.service';
import { marketplaceInstallations } from '../database/schema';
import { TokenCipherService } from './token-cipher.service';

const HIGHLEVEL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';
const HIGHLEVEL_LOCATION_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/location-token';
const HIGHLEVEL_INSTALLED_LOCATIONS_URL =
  'https://services.leadconnectorhq.com/oauth/installed-locations';
const EXPIRY_SAFETY_WINDOW_MS = 60_000;
const INSTALLED_LOCATIONS_PAGE_SIZE = 100;

const tokenResponseSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object') return value;
    const response = value as Record<string, unknown>;
    return {
      access_token: response.accessToken ?? response.access_token,
      token_type: response.tokenType ?? response.token_type,
      expires_in: response.expiresIn ?? response.expires_in,
      refresh_token: response.refreshToken ?? response.refresh_token,
      scope: response.scope,
      userType: response.userType,
      locationId: response.locationId,
      companyId: response.companyId,
      userId: response.userId,
      approvedLocations: response.approvedLocations,
    };
  },
  z.object({
    access_token: z.string().min(1),
    token_type: z.string().min(1).default('Bearer'),
    expires_in: z.coerce.number().int().positive(),
    refresh_token: z.string().min(1),
    scope: z.string().default(''),
    userType: z.enum(['Location', 'Company']),
    locationId: z.string().min(1).optional(),
    companyId: z.string().min(1).optional(),
    userId: z.string().min(1),
    approvedLocations: z.array(z.string().min(1)).default([]),
  }),
);

type TokenResponse = z.infer<typeof tokenResponseSchema>;

const installedLocationSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object') return value;
    const location = value as Record<string, unknown>;
    return {
      id: location._id ?? location.id ?? location.locationId,
      isInstalled: location.isInstalled ?? true,
    };
  },
  z.object({
    id: z.string().min(1),
    isInstalled: z.boolean().default(true),
  }),
);

const installedLocationsResponseSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== 'object') return value;
    const response = value as Record<string, unknown>;
    const data = response.data && typeof response.data === 'object'
      ? (response.data as Record<string, unknown>)
      : response;
    return {
      items: data.items,
      pagination: data.pagination,
    };
  },
  z.object({
    items: z.array(installedLocationSchema),
    pagination: z.object({
      hasNextPage: z.boolean(),
      nextPageToken: z.string().min(1).nullish(),
      currentPageSize: z.coerce.number().int().nonnegative(),
    }),
  }),
);

export interface HighLevelCredential {
  token: string;
  source: 'oauth' | 'development_pit';
}

@Injectable()
export class HighLevelAuthService {
  private readonly refreshes = new Map<string, Promise<HighLevelCredential>>();

  constructor(
    private readonly configService: ConfigService<Environment, true>,
    private readonly databaseService: DatabaseService,
    private readonly tokenCipher: TokenCipherService,
  ) {}

  async exchangeAuthorizationCode(code: string): Promise<{ locationId: string }> {
    const configuration = this.getOAuthConfiguration();
    const token = await this.requestToken({
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      grantType: 'authorization_code',
      code,
      userType: 'Location',
      redirectUri: configuration.redirectUri,
    });

    if (token.userType === 'Company') {
      const locationIds = await this.resolveCompanyLocationIds(token);
      let primaryLocationId: string | undefined;
      for (const locationId of locationIds) {
        const locationToken = await this.exchangeCompanyToken(token, locationId);
        await this.persistToken(locationToken, false);
        primaryLocationId ??= locationToken.locationId;
      }
      if (!primaryLocationId) {
        throw new UnprocessableEntityException(
          'The agency installation did not resolve to an installed location.',
        );
      }
      return { locationId: primaryLocationId };
    }

    this.assertLocationToken(token);
    await this.persistToken(token, false);
    return { locationId: token.locationId };
  }

  async getCredential(locationId: string, forceRefresh = false): Promise<HighLevelCredential> {
    const [installation] = await this.databaseService.client
      .select()
      .from(marketplaceInstallations)
      .where(eq(marketplaceInstallations.locationId, locationId))
      .limit(1);

    if (installation && !installation.uninstalledAt) {
      const refreshRequired =
        forceRefresh ||
        installation.accessTokenExpiresAt.getTime() <= Date.now() + EXPIRY_SAFETY_WINDOW_MS;
      if (refreshRequired) return this.refreshCredential(locationId);

      return {
        token: this.tokenCipher.decrypt(installation.encryptedAccessToken),
        source: 'oauth',
      };
    }

    if (installation?.uninstalledAt) {
      throw new BadRequestException(`HighLevel is uninstalled for location ${locationId}.`);
    }

    const environment = this.configService.get('NODE_ENV', { infer: true });
    const developmentLocationId = this.configService.get('SUB_ACCOUNT_LOCATION_ID', {
      infer: true,
    });
    const developmentPit = this.configService.get('SUB_ACCOUNT_PIT', { infer: true });
    if (environment !== 'production' && developmentLocationId === locationId && developmentPit) {
      return { token: developmentPit, source: 'development_pit' };
    }

    throw new BadRequestException(
      `No active HighLevel installation exists for location ${locationId}.`,
    );
  }

  resolveLocationId(requestedLocationId?: string): string {
    if (requestedLocationId?.trim()) return requestedLocationId.trim();

    const developmentLocationId = this.configService.get('SUB_ACCOUNT_LOCATION_ID', {
      infer: true,
    });
    if (developmentLocationId) return developmentLocationId;

    throw new BadRequestException('A locationId query parameter is required.');
  }

  async getStatus(requestedLocationId?: string): Promise<HighLevelAuthStatus> {
    const locationId = this.resolveLocationId(requestedLocationId);
    const [installation] = await this.databaseService.client
      .select({
        accessTokenExpiresAt: marketplaceInstallations.accessTokenExpiresAt,
        uninstalledAt: marketplaceInstallations.uninstalledAt,
      })
      .from(marketplaceInstallations)
      .where(eq(marketplaceInstallations.locationId, locationId))
      .limit(1);

    const developmentLocationId = this.configService.get('SUB_ACCOUNT_LOCATION_ID', {
      infer: true,
    });
    const developmentPit = this.configService.get('SUB_ACCOUNT_PIT', { infer: true });
    const developmentFallback =
      this.configService.get('NODE_ENV', { infer: true }) !== 'production' &&
      !installation &&
      developmentLocationId === locationId &&
      Boolean(developmentPit);

    const activeInstallation = installation && !installation.uninstalledAt ? installation : null;

    return {
      locationId,
      marketplaceConfigured: this.isOAuthConfigured(),
      connected: Boolean(activeInstallation) || developmentFallback,
      authMode: activeInstallation ? 'oauth' : developmentFallback ? 'development_pit' : 'none',
      accessTokenExpiresAt: activeInstallation?.accessTokenExpiresAt.toISOString() ?? null,
    };
  }

  private refreshCredential(locationId: string): Promise<HighLevelCredential> {
    const activeRefresh = this.refreshes.get(locationId);
    if (activeRefresh) return activeRefresh;

    const refresh = this.performRefresh(locationId).finally(() => {
      this.refreshes.delete(locationId);
    });
    this.refreshes.set(locationId, refresh);
    return refresh;
  }

  private async performRefresh(locationId: string): Promise<HighLevelCredential> {
    const [installation] = await this.databaseService.client
      .select()
      .from(marketplaceInstallations)
      .where(
        and(
          eq(marketplaceInstallations.locationId, locationId),
          isNull(marketplaceInstallations.uninstalledAt),
        ),
      )
      .limit(1);
    if (!installation) {
      throw new BadRequestException(
        `No active HighLevel installation exists for location ${locationId}.`,
      );
    }

    const configuration = this.getOAuthConfiguration();
    const token = await this.requestToken({
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      grantType: 'refresh_token',
      refreshToken: this.tokenCipher.decrypt(installation.encryptedRefreshToken),
      userType: 'Location',
      redirectUri: configuration.redirectUri,
    });
    this.assertLocationToken(token);
    if (token.locationId !== locationId) {
      throw new BadGatewayException('HighLevel refreshed a token for a different location.');
    }

    await this.persistToken(token, true);
    return { token: token.access_token, source: 'oauth' };
  }

  private async persistToken(token: TokenResponse & { locationId: string }, refreshed: boolean) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + token.expires_in * 1_000);
    await this.databaseService.client
      .insert(marketplaceInstallations)
      .values({
        locationId: token.locationId,
        companyId: token.companyId,
        userId: token.userId,
        userType: token.userType,
        tokenType: token.token_type,
        encryptedAccessToken: this.tokenCipher.encrypt(token.access_token),
        encryptedRefreshToken: this.tokenCipher.encrypt(token.refresh_token),
        accessTokenExpiresAt: expiresAt,
        scopes: token.scope.trim() ? token.scope.trim().split(/\s+/) : [],
        lastRefreshedAt: refreshed ? now : null,
        uninstalledAt: null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: marketplaceInstallations.locationId,
        set: {
          companyId: token.companyId,
          userId: token.userId,
          userType: token.userType,
          tokenType: token.token_type,
          encryptedAccessToken: this.tokenCipher.encrypt(token.access_token),
          encryptedRefreshToken: this.tokenCipher.encrypt(token.refresh_token),
          accessTokenExpiresAt: expiresAt,
          scopes: token.scope.trim() ? token.scope.trim().split(/\s+/) : [],
          lastRefreshedAt: refreshed ? now : null,
          uninstalledAt: null,
          updatedAt: now,
        },
      });
  }

  private assertLocationToken(token: TokenResponse): asserts token is TokenResponse & {
    locationId: string;
    userType: 'Location';
  } {
    if (token.userType !== 'Location' || !token.locationId) {
      throw new UnprocessableEntityException(
        'This app requires a location-level installation. Configure the Marketplace app target user as Sub-account and install it into a location.',
      );
    }
  }

  private async resolveCompanyLocationIds(companyToken: TokenResponse): Promise<string[]> {
    if (!companyToken.companyId) {
      throw new BadGatewayException('HighLevel returned a Company token without a companyId.');
    }

    const approvedLocations = [...new Set(companyToken.approvedLocations)];
    if (approvedLocations.length > 0) return approvedLocations;

    this.assertCompanyTokenScopes(companyToken);

    const installedLocationIds = new Set<string>();
    const visitedPageTokens = new Set<string>();
    let pageToken: string | undefined;
    while (true) {
      const url = new URL(HIGHLEVEL_INSTALLED_LOCATIONS_URL);
      url.searchParams.set('companyId', companyToken.companyId);
      url.searchParams.set('appId', this.getMarketplaceAppId());
      url.searchParams.set('isInstalled', 'true');
      url.searchParams.set('pageSize', String(INSTALLED_LOCATIONS_PAGE_SIZE));
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${companyToken.access_token}`,
          Version: 'v3',
        },
      });
      if (!response.ok) {
        throw new BadGatewayException(
          `HighLevel installed-location discovery failed with status ${response.status}.`,
        );
      }

      const parsed = installedLocationsResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new BadGatewayException('HighLevel returned an invalid installed-location response.');
      }
      for (const location of parsed.data.items) {
        if (location.isInstalled) installedLocationIds.add(location.id);
      }

      if (!parsed.data.pagination.hasNextPage) break;

      const nextPageToken = parsed.data.pagination.nextPageToken;
      if (!nextPageToken || visitedPageTokens.has(nextPageToken)) {
        throw new BadGatewayException(
          'HighLevel returned invalid installed-location pagination metadata.',
        );
      }
      visitedPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    }

    if (installedLocationIds.size > 0) return [...installedLocationIds];

    const developmentLocationId = this.configService.get('SUB_ACCOUNT_LOCATION_ID', {
      infer: true,
    });
    if (this.configService.get('NODE_ENV', { infer: true }) !== 'production' && developmentLocationId) {
      return [developmentLocationId];
    }
    throw new UnprocessableEntityException(
      'HighLevel did not report an installed location for this agency installation.',
    );
  }

  private assertCompanyTokenScopes(companyToken: TokenResponse): void {
    const scopes = new Set(companyToken.scope.trim().split(/\s+/).filter(Boolean));
    const missingScopes = ['oauth.readonly', 'oauth.write'].filter((scope) => !scopes.has(scope));
    if (missingScopes.length > 0) {
      throw new UnprocessableEntityException(
        `Agency bulk installation requires these HighLevel scopes: ${missingScopes.join(', ')}.`,
      );
    }
  }

  private async exchangeCompanyToken(
    companyToken: TokenResponse,
    locationId: string,
  ): Promise<TokenResponse & { locationId: string; userType: 'Location' }> {
    if (!companyToken.companyId) {
      throw new BadGatewayException('HighLevel returned a Company token without a companyId.');
    }

    const response = await fetch(HIGHLEVEL_LOCATION_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${companyToken.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Version: 'v3',
      },
      body: new URLSearchParams({ companyId: companyToken.companyId, locationId }),
    });
    if (!response.ok) {
      throw new BadGatewayException(
        `HighLevel Company-to-Location token exchange failed with status ${response.status}. Verify that the installation grants the requested location and that the Company token is active.`,
      );
    }

    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new BadGatewayException('HighLevel returned an invalid Location token response.');
    }
    this.assertLocationToken(parsed.data);
    if (parsed.data.locationId !== locationId) {
      throw new BadGatewayException('HighLevel exchanged a token for a different location.');
    }
    return parsed.data;
  }

  private getMarketplaceAppId(): string {
    const configuredAppId = this.configService.get('HIGHLEVEL_APP_ID', { infer: true });
    if (configuredAppId) return configuredAppId;

    const clientId = this.getOAuthConfiguration().clientId;
    const [derivedAppId] = clientId.split('-');
    if (!derivedAppId) throw new ServiceUnavailableException('HighLevel app ID is not configured.');
    return derivedAppId;
  }

  private async requestToken(parameters: Record<string, string>): Promise<TokenResponse> {
    const response = await fetch(HIGHLEVEL_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Version: 'v3',
      },
      body: new URLSearchParams(parameters),
    });

    if (!response.ok) {
      throw new BadGatewayException(
        `HighLevel OAuth token exchange failed with status ${response.status}.`,
      );
    }

    const parsed = tokenResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new BadGatewayException('HighLevel returned an invalid OAuth token response.');
    }
    return parsed.data;
  }

  private isOAuthConfigured(): boolean {
    return Boolean(this.configService.get('HIGHLEVEL_CLIENT_ID', { infer: true }));
  }

  private getOAuthConfiguration(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId = this.configService.get('HIGHLEVEL_CLIENT_ID', { infer: true });
    const clientSecret = this.configService.get('HIGHLEVEL_CLIENT_SECRET', { infer: true });
    const redirectUri = this.configService.get('HIGHLEVEL_REDIRECT_URI', { infer: true });
    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException('HighLevel Marketplace OAuth is not configured.');
    }
    return { clientId, clientSecret, redirectUri };
  }
}
