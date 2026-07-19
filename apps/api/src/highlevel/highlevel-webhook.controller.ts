import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';

import { HighLevelWebhookService } from './highlevel-webhook.service';

interface RawBodyRequest {
  rawBody?: Buffer;
}

@Controller('leadconnector')
export class HighLevelWebhookController {
  constructor(private readonly webhookService: HighLevelWebhookService) {}

  @Post('webhook')
  @HttpCode(200)
  handle(
    @Req() request: RawBodyRequest,
    @Headers('x-ghl-signature') signature: string | undefined,
    @Body() body: unknown,
  ) {
    return this.webhookService.handle(request.rawBody, signature, body);
  }
}
