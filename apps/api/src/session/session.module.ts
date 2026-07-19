import { Module } from '@nestjs/common';

import { LocationContextGuard } from './location-context.guard';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Module({
  controllers: [SessionController],
  providers: [SessionService, LocationContextGuard],
  exports: [LocationContextGuard],
})
export class SessionModule {}
