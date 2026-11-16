import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { can } from '../access/permissions.js';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { TimeclockService } from './timeclock.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

const daySchema = z.object({ date });

const validateSchema = z.object({
  employeeId: z.uuid(),
  clockInAt: z.coerce.date().optional(),
  shiftId: z.uuid().optional(),
  date,
  start: time,
  end: time,
  breakMinutes: z.number().int().min(0).max(240),
  meals: z.number().int().min(0).max(5).default(0),
  corrected: z.boolean().default(false),
  reason: z.string().max(500).optional(),
});

/** The Badgeuse tab: planned against clocked hours, and their validation. */
@Controller('sites/:siteId')
@UseGuards(SessionGuard)
export class HoursController {
  constructor(
    private readonly timeclock: TimeclockService,
    private readonly access: AccessService,
  ) {}

  @Get('hours')
  async hours(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Query({ schema: daySchema }) { date: day }: z.infer<typeof daySchema>,
  ) {
    this.access.assert(user, 'hours.read', siteId);
    return {
      ...(await this.timeclock.hours(siteId, day)),
      // HR and the operations team look without validating.
      canValidate: can(user.grants, 'hours.validate', siteId),
    };
  }

  /** The seven days of a week, with how many rows are validated on each. */
  @Get('hours/week')
  week(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Query({ schema: daySchema }) { date: monday }: z.infer<typeof daySchema>,
  ) {
    this.access.assert(user, 'hours.read', siteId);
    return this.timeclock.week(siteId, monday);
  }

  @Post('time-entries')
  validate(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Body({ schema: validateSchema }) dto: z.infer<typeof validateSchema>,
  ) {
    this.access.assert(user, 'hours.validate', siteId);
    return this.timeclock.validate(user, siteId, dto);
  }

  @Delete('time-entries/:id')
  unvalidate(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Param('id') id: string,
  ) {
    this.access.assert(user, 'hours.validate', siteId);
    return this.timeclock.unvalidate(user, siteId, id);
  }
}
