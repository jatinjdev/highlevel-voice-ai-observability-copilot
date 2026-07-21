import { Module } from '@nestjs/common';

import { HighLevelModule } from '../highlevel/highlevel.module';
import { PipelineService } from './pipeline.service';

@Module({
  imports: [HighLevelModule],
  providers: [PipelineService],
  exports: [PipelineService],
})
export class PipelineModule {}
