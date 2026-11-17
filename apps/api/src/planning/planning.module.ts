import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller.js';
import { PlanningService } from './planning.service.js';
import { PublicationService } from './publication.service.js';

@Module({
  controllers: [PlanningController],
  providers: [PlanningService, PublicationService],
  // The time clock checks day locks; Mon espace checks publication.
  exports: [PlanningService, PublicationService],
})
export class PlanningModule {}
