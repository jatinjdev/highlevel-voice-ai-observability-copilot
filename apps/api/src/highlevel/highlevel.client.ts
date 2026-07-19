import { BadGatewayException, Injectable } from '@nestjs/common';

import { HighLevelAuthService, type HighLevelCredential } from './highlevel-auth.service';

const HIGHLEVEL_API_BASE_URL = 'https://services.leadconnectorhq.com';

@Injectable()
export class HighLevelClient {
  constructor(private readonly authService: HighLevelAuthService) {}

  async get<T>(locationId: string, path: string, query: Record<string, string> = {}): Promise<T> {
    const url = new URL(path, HIGHLEVEL_API_BASE_URL);

    url.searchParams.set('locationId', locationId);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    const credential = await this.authService.getCredential(locationId);
    let response = await this.request(url, credential);

    // An OAuth token may have been revoked or expired early. Refresh once, then surface the error.
    if (response.status === 401 && credential.source === 'oauth') {
      const refreshedCredential = await this.authService.getCredential(locationId, true);
      response = await this.request(url, refreshedCredential);
    }

    if (!response.ok) {
      throw new BadGatewayException(`HighLevel request failed with status ${response.status}.`);
    }

    return (await response.json()) as T;
  }

  private request(url: URL, credential: HighLevelCredential): Promise<Response> {
    return fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${credential.token}`,
        Version: 'v3',
      },
    });
  }
}
