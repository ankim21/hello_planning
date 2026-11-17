import { Module } from '@nestjs/common';
import { PlanningModule } from '../planning/planning.module.js';
import { MeController } from './me.controller.js';
import { MeService } from './me.service.js';

@Module({
  imports: [PlanningModule], // for the published weeks
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
