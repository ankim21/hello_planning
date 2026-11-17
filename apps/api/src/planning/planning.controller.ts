import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { PlanningService } from './planning.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

// A week (7 days from a Monday) or a month (up to 31 days from the 1st).
const periodSchema = z.object({
  from: date,
  days: z.coerce.number().int().min(1).max(42).default(7),
});

const shiftSchema = z.object({
  employeeId: z.uuid(),
  postId: z.uuid(),
  service: z.enum(['AM', 'PM']),
  date,
  start: time,
  end: time,
  // Left out, both follow the company rule for that start time
  // (20 minutes and one meal; none for a start at 12:00 or 19:00).
  breakMinutes: z.number().int().min(0).max(240).optional(),
  meals: z.number().int().min(0).max(5).optional(),
  note: z.string().max(500).optional(),
});

const absenceSchema = z.object({
  employeeId: z.uuid(),
  absenceTypeId: z.uuid(),
  startDate: date,
  endDate: date,
  dayPart: z.enum(['FULL_DAY', 'HALF_DAY', 'CUSTOM']),
  startTime: time.optional(),
  endTime: time.optional(),
  note: z.string().max(500).optional(),
});

const needsSchema = z.object({
  needs: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6), // 0 = Monday
        service: z.enum(['AM', 'PM']),
        postId: z.uuid().nullable(),
        department: z.enum(['KITCHEN', 'SALLE']).nullable(),
        count: z.number().int().min(0).max(50),
      }),
    )
    .max(500),
});
const publicationSchema = z.object({
  department: z.enum(['KITCHEN', 'SALLE']),
  published: z.boolean(),
});
const lockSchema = z.object({ status: z.enum(['OPEN', 'LOCKED', 'PAYROLL']) });

/** The weekly planning of a site: shifts, absences and day locks. */
@Controller('sites/:siteId')
@UseGuards(SessionGuard)
export class PlanningController {
  constructor(
    private readonly planning: PlanningService,
    private readonly access: AccessService,
  ) {}

  @Get('planning')
  async period(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Query({ schema: periodSchema }) { from, days }: z.infer<typeof periodSchema>,
  ) {
    await this.access.assertCanSeePlanning(user, siteId);
    return this.planning.period(user, siteId, from, days);
  }

  // Rights for the calls below are checked inside the service, because they
  // depend on the post (kitchen or salle) and on the day's lock.

  @Post('shifts')
  createShift(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Body({ schema: shiftSchema }) dto: z.infer<typeof shiftSchema>,
  ) {
    return this.planning.createShift(user, siteId, dto);
  }

  @Patch('shifts/:id')
  updateShift(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @Body({ schema: shiftSchema }) dto: z.infer<typeof shiftSchema>,
  ) {
    return this.planning.updateShift(user, siteId, id, dto);
  }

  @Delete('shifts/:id')
  deleteShift(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Param('id') id: string,
  ) {
    return this.planning.deleteShift(user, siteId, id);
  }

  @Post('absences')
  createAbsence(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Body({ schema: absenceSchema }) dto: z.infer<typeof absenceSchema>,
  ) {
    return this.planning.createAbsence(user, siteId, dto);
  }

  @Patch('absences/:id')
  updateAbsence(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Param('id') id: string,
    @Body({ schema: absenceSchema }) dto: z.infer<typeof absenceSchema>,
  ) {
    return this.planning.updateAbsence(user, siteId, id, dto);
  }

  @Delete('absences/:id')
  deleteAbsence(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Param('id') id: string,
  ) {
    return this.planning.deleteAbsence(user, siteId, id);
  }

  @Get('needs')
  needs(@CurrentUser() user: SessionUser, @Param('siteId') siteId: string) {
    this.access.assert(user, 'shift.read', siteId);
    return this.planning.needs(siteId);
  }

  @Put('needs')
  setNeeds(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Body({ schema: needsSchema }) { needs }: z.infer<typeof needsSchema>,
  ) {
    return this.planning.setNeeds(user, siteId, needs);
  }

  @Get('popular-shifts')
  popularShifts(@CurrentUser() user: SessionUser, @Param('siteId') siteId: string) {
    this.access.assert(user, 'shift.read', siteId);
    return this.planning.popularShifts(siteId);
  }

  @Put('weeks/:monday/publication')
  setPublication(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Param('monday', { schema: date }) monday: string,
    @Body({ schema: publicationSchema })
    { department, published }: z.infer<typeof publicationSchema>,
  ) {
    return this.planning.setPublication(user, siteId, monday, department, published);
  }

  @Put('days/:date/lock')
  setDayLock(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Param('date', { schema: date }) day: string,
    @Body({ schema: lockSchema }) { status }: z.infer<typeof lockSchema>,
  ) {
    return this.planning.setDayLock(user, siteId, day, status);
  }
}
