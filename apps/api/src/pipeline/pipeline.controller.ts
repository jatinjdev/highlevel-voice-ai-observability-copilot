import type { PipelineSummary, PipelineSyncResponse } from '@copilot/contracts';
import { Controller, Get, Post, UseGuards } from '@nestjs/common';

import { LocationContext } from '../session/location-context';
import { LocationContextGuard } from '../session/location-context.guard';
import { PipelineService } from './pipeline.service';

@Controller('pipeline')
@UseGuards(LocationContextGuard)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  getSummary(@LocationContext() locationId: string): Promise<PipelineSummary> {
    return this.pipelineService.getSummary(locationId);
  }

  @Post('sync')
  sync(@LocationContext() locationId: string): Promise<PipelineSyncResponse> {
    return this.pipelineService.sync(locationId);
  }
}
