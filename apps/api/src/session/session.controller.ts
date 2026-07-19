import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';

import { SessionService } from './session.service';

const sessionRequestSchema = z.object({ encryptedData: z.string().min(1) });

@Controller('leadconnector/session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post()
  create(@Body() body: unknown) {
    const request = sessionRequestSchema.safeParse(body);
    if (!request.success) {
      throw new BadRequestException('encryptedData is required.');
    }
    return this.sessionService.exchange(request.data.encryptedData);
  }
}
