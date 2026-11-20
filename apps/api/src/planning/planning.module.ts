import { Module } from '@nestjs/common';
import { ArchiveController } from './archive.controller.js';
import { ArchiveService } from './archive.service.js';
import { PlanningController } from './planning.controller.js';
import { PlanningService } from './planning.service.js';
import { PublicationService } from './publication.service.js';

@Module({
  controllers: [PlanningController, ArchiveController],
  providers: [PlanningService, PublicationService, ArchiveService],
  // The time clock checks day locks; Mon espace checks publication.
  exports: [PlanningService, PublicationService],
})
export class PlanningModule {}
