import { Module } from '@nestjs/common';

import { SessionModule } from '../session/session.module';
import { ObservabilityController } from './observability.controller';
import { ObservabilityService } from './observability.service';
import { SuccessCriteriaService } from './success-criteria.service';

@Module({
  imports: [SessionModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityService, SuccessCriteriaService],
})
export class ObservabilityModule {}
