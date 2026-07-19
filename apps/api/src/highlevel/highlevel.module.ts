import { Module } from '@nestjs/common';

import { HighLevelAuthService } from './highlevel-auth.service';
import { HighLevelClient } from './highlevel.client';
import { HighLevelOAuthController } from './highlevel-oauth.controller';
import { HighLevelWebhookController } from './highlevel-webhook.controller';
import { HighLevelWebhookRepository } from './highlevel-webhook.repository';
import { HighLevelWebhookService } from './highlevel-webhook.service';
import { TokenCipherService } from './token-cipher.service';

@Module({
  controllers: [HighLevelOAuthController, HighLevelWebhookController],
  providers: [
    HighLevelAuthService,
    HighLevelClient,
    HighLevelWebhookRepository,
    HighLevelWebhookService,
    TokenCipherService,
  ],
  exports: [HighLevelAuthService, HighLevelClient],
})
export class HighLevelModule {}
