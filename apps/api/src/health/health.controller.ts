import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@copilot/contracts';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'The API is ready to accept requests.' })
  check(): HealthResponse {
    return {
      status: 'ok',
      service: 'voice-ai-observability-api',
      timestamp: new Date().toISOString(),
    };
  }
}
