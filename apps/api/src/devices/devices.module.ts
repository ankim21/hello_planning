import { Module } from '@nestjs/common';
import { DeviceGuard } from './device.guard.js';
import { DevicesController } from './devices.controller.js';

@Module({
  controllers: [DevicesController],
  providers: [DeviceGuard],
  exports: [DeviceGuard],
})
export class DevicesModule {}
