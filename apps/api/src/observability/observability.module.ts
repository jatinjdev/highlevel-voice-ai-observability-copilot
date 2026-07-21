import { Module } from '@nestjs/common';

import { PipelineModule } from '../pipeline/pipeline.module';
import { SessionModule } from '../session/session.module';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';
import { RecommendationCommandsService } from './recommendation-commands.service';
import { SuccessCriteriaService } from './success-criteria.service';

@Module({
  imports: [PipelineModule, SessionModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityService, SuccessCriteriaService, RecommendationCommandsService],
})
export class ObservabilityModule {}
