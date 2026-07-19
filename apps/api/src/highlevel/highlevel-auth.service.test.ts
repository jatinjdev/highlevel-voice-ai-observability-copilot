import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Environment } from '../config/environment.schema';
import type { DatabaseService } from '../database/database.service';
import { HighLevelAuthService } from './highlevel-auth.service';
import { TokenCipherService } from './token-cipher.service';

const environment: Partial<Environment> = {
  NODE_ENV: 'development',
  HIGHLEVEL_CLIENT_ID: 'client-id',
  HIGHLEVEL_CLIENT_SECRET: 'client-secret',
  HIGHLEVEL_APP_ID: 'app-id',
  HIGHLEVEL_REDIRECT_URI: 'https://example.com/api/leadconnector/oauth/callback',
  HIGHLEVEL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 13).toString('base64'),
};

function createConfigService(): ConfigService<Environment, true> {
  return {
    get: (key: keyof Environment) => environment[key],
  } as ConfigService<Environment, true>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HighLevelAuthService', () => {
  it('exchanges a v3 authorization code and stores encrypted tokens', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn((installation: Record<string, unknown>) => ({
      onConflictDoUpdate,
      installation,
    }));
    const insert = vi.fn(() => ({ values }));
    const databaseService = {
      client: { insert },
    } as unknown as DatabaseService;
    const configService = createConfigService();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'access-token',
          tokenType: 'Bearer',
          expiresIn: 86_399,
          refreshToken: 'refresh-token',
          scope: 'voice-ai-dashboard.readonly voice-ai-agents.readonly',
          userType: 'Location',
          locationId: 'location-id',
          companyId: 'company-id',
          userId: 'user-id',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = new HighLevelAuthService(
      configService,
      databaseService,
      new TokenCipherService(configService),
    );
    await expect(service.exchangeAuthorizationCode('one-time-code')).resolves.toEqual({
      locationId: 'location-id',
    });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.headers).toMatchObject({ Version: 'v3' });
    expect(Object.fromEntries(new URLSearchParams(request.body as string))).toMatchObject({
      clientId: 'client-id',
      grantType: 'authorization_code',
      code: 'one-time-code',
      userType: 'Location',
    });

    const stored = values.mock.calls[0]?.[0] as unknown as {
      encryptedAccessToken: string;
      encryptedRefreshToken: string;
    };
    expect(stored.encryptedAccessToken).not.toContain('access-token');
    expect(stored.encryptedRefreshToken).not.toContain('refresh-token');
  });

  it('exchanges an agency installer token for its approved location token', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn((installation: Record<string, unknown>) => ({
      onConflictDoUpdate,
      installation,
    }));
    const databaseService = {
      client: { insert: vi.fn(() => ({ values })) },
    } as unknown as DatabaseService;
    const configService = createConfigService();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'company-access-token',
            tokenType: 'Bearer',
            expiresIn: 86_399,
            refreshToken: 'company-refresh-token',
            scope: 'voice-ai-dashboard.readonly voice-ai-agents.readonly oauth.write',
            userType: 'Company',
            companyId: 'company-id',
            approvedLocations: ['location-id'],
            userId: 'user-id',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'location-access-token',
            tokenType: 'Bearer',
            expiresIn: 86_399,
            refreshToken: 'location-refresh-token',
            scope: 'voice-ai-dashboard.readonly voice-ai-agents.readonly',
            userType: 'Location',
            companyId: 'company-id',
            locationId: 'location-id',
            userId: 'user-id',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const service = new HighLevelAuthService(
      configService,
      databaseService,
      new TokenCipherService(configService),
    );
    await expect(service.exchangeAuthorizationCode('agency-code')).resolves.toEqual({
      locationId: 'location-id',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [locationTokenUrl, locationTokenRequest] = fetchMock.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(locationTokenUrl).toBe('https://services.leadconnectorhq.com/oauth/location-token');
    expect(locationTokenRequest.headers).toMatchObject({
      Authorization: 'Bearer company-access-token',
      Version: 'v3',
    });
    expect(Object.fromEntries(new URLSearchParams(locationTokenRequest.body as string))).toEqual({
      companyId: 'company-id',
      locationId: 'location-id',
    });

    const stored = values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(stored.locationId).toBe('location-id');
    expect(stored.userType).toBe('Location');
  });

  it('discovers installed locations when a bulk agency token omits approvedLocations', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn((installation: Record<string, unknown>) => ({
      onConflictDoUpdate,
      installation,
    }));
    const databaseService = {
      client: { insert: vi.fn(() => ({ values })) },
    } as unknown as DatabaseService;
    const configService = createConfigService();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'company-access-token',
            tokenType: 'Bearer',
            expiresIn: 86_399,
            refreshToken: 'company-refresh-token',
            scope:
              'voice-ai-dashboard.readonly voice-ai-agents.readonly oauth.readonly oauth.write',
            userType: 'Company',
            companyId: 'company-id',
            userId: 'user-id',
            isBulkInstallation: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ _id: 'location-id', isInstalled: true }],
            pagination: {
              hasNextPage: false,
              hasPrevPage: false,
              currentPageSize: 1,
            },
            installToFutureLocations: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'location-access-token',
            tokenType: 'Bearer',
            expiresIn: 86_399,
            refreshToken: 'location-refresh-token',
            scope: 'voice-ai-dashboard.readonly voice-ai-agents.readonly',
            userType: 'Location',
            companyId: 'company-id',
            locationId: 'location-id',
            userId: 'user-id',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const service = new HighLevelAuthService(
      configService,
      databaseService,
      new TokenCipherService(configService),
    );
    await expect(service.exchangeAuthorizationCode('bulk-agency-code')).resolves.toEqual({
      locationId: 'location-id',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [installedLocationsUrl, installedLocationsRequest] = fetchMock.mock.calls[1] as [
      URL,
      RequestInit,
    ];
    expect(installedLocationsUrl.pathname).toBe('/oauth/installed-locations');
    expect(Object.fromEntries(installedLocationsUrl.searchParams)).toMatchObject({
      companyId: 'company-id',
      appId: 'app-id',
      isInstalled: 'true',
      pageSize: '100',
    });
    expect(installedLocationsUrl.searchParams.has('skip')).toBe(false);
    expect(installedLocationsUrl.searchParams.has('limit')).toBe(false);
    expect(installedLocationsRequest.headers).toMatchObject({
      Authorization: 'Bearer company-access-token',
      Version: 'v3',
    });
    expect(values.mock.calls[0]?.[0]).toMatchObject({
      locationId: 'location-id',
      userType: 'Location',
    });
  });
});
