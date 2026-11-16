import { Module } from '@nestjs/common';
import { PlanningModule } from '../planning/planning.module.js';
import { LeaveController } from './leave.controller.js';
import { LeaveService } from './leave.service.js';

@Module({
  imports: [PlanningModule], // for the day locks
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
