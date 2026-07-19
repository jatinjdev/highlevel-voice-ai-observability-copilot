import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@copilot/contracts';
import { sql } from 'drizzle-orm';

import { DatabaseService } from '../database/database.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get(['', 'live'])
  @ApiOkResponse({ description: 'The API process is alive.' })
  live(): HealthResponse {
    return {
      status: 'ok',
      service: 'voice-ai-observability-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'The API and its database dependency are ready.' })
  async ready(): Promise<HealthResponse> {
    await this.databaseService.client.execute(sql`select 1`);
    return this.live();
  }
}
