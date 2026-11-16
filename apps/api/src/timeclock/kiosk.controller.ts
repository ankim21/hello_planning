import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../core/prisma.service.js';
import {
  CurrentDevice,
  type CurrentDeviceInfo,
  DeviceGuard,
} from '../devices/device.guard.js';
import { TimeclockService } from './timeclock.service.js';

const pin = z.string().regex(/^\d{4}$/);

const rosterSchema = z.object({
  // First letters of the last name. Two are accepted for very short names.
  prefix: z.string().trim().min(2).max(20),
});
const identifySchema = z.object({ employeeId: z.uuid(), pin });
const clockSchema = z.object({
  eventId: z.uuid(),
  employeeId: z.uuid(),
  pin,
  kind: z.enum(['IN', 'OUT', 'BREAK_START', 'BREAK_END']),
  occurredAt: z.coerce.date(),
});

/** Everything the shared tablet calls. Protected by the tablet's token. */
@Controller('kiosk')
@UseGuards(DeviceGuard)
export class KioskController {
  constructor(
    private readonly timeclock: TimeclockService,
    private readonly prisma: PrismaService,
  ) {}

  /** Lets the tablet show which site it is registered for. */
  @Get('site')
  async site(@CurrentDevice() device: CurrentDeviceInfo) {
    const site = await this.prisma.site.findUniqueOrThrow({
      where: { id: device.siteId },
      select: { id: true, name: true, timezone: true },
    });
    return { site, deviceName: device.name };
  }

  @Get('employees')
  employees(
    @CurrentDevice() device: CurrentDeviceInfo,
    @Query({ schema: rosterSchema }) { prefix }: z.infer<typeof rosterSchema>,
  ) {
    return this.timeclock.roster(device.siteId, prefix);
  }

  @Post('identify')
  @HttpCode(200)
  identify(
    @CurrentDevice() device: CurrentDeviceInfo,
    @Body({ schema: identifySchema }) dto: z.infer<typeof identifySchema>,
  ) {
    return this.timeclock.identify(device, dto.employeeId, dto.pin);
  }

  @Post('clock')
  @HttpCode(200)
  clock(
    @CurrentDevice() device: CurrentDeviceInfo,
    @Body({ schema: clockSchema }) dto: z.infer<typeof clockSchema>,
  ) {
    return this.timeclock.clock(device, dto);
  }
}
