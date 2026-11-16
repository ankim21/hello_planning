import { Module } from '@nestjs/common';
import { DevicesModule } from '../devices/devices.module.js';
import { PlanningModule } from '../planning/planning.module.js';
import { HoursController } from './hours.controller.js';
import { KioskController } from './kiosk.controller.js';
import { TimeclockService } from './timeclock.service.js';

@Module({
  imports: [DevicesModule, PlanningModule],
  controllers: [KioskController, HoursController],
  providers: [TimeclockService],
})
export class TimeclockModule {}
