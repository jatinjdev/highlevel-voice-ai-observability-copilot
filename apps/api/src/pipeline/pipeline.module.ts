import { Module } from '@nestjs/common';

import { HighLevelModule } from '../highlevel/highlevel.module';
import { SessionModule } from '../session/session.module';
import { PipelineController } from './pipeline.controller';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [HighLevelModule, SessionModule],
  controllers: [PipelineController],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
