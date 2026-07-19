import type { HighLevelAuthStatus } from '@copilot/contracts';
import { BadRequestException, Controller, Get, Query, Redirect } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../config/environment.schema';
import { HighLevelAuthService } from './highlevel-auth.service';

@Controller('leadconnector/oauth')
export class HighLevelOAuthController {
  constructor(
    private readonly authService: HighLevelAuthService,
    private readonly configService: ConfigService<Environment, true>,
  ) {}

  @Get(['', 'callback'])
  @Redirect()
  async callback(@Query('code') code?: string): Promise<{ url: string; statusCode: 302 }> {
    if (!code) throw new BadRequestException('HighLevel did not provide an authorization code.');

    const { locationId } = await this.authService.exchangeAuthorizationCode(code);
    const destination = new URL(
      this.configService.get('HIGHLEVEL_POST_INSTALL_REDIRECT_URI', { infer: true }) ??
        this.configService.get('WEB_ORIGIN', { infer: true }),
    );
    destination.searchParams.set('oauth', 'connected');
    destination.searchParams.set('locationId', locationId);
    return { url: destination.toString(), statusCode: 302 };
  }

  @Get('status')
  status(@Query('locationId') locationId?: string): Promise<HighLevelAuthStatus> {
    return this.authService.getStatus(locationId);
  }
}
