import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { LeaveService } from './leave.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

const requestSchema = z.object({
  absenceTypeId: z.uuid(),
  startDate: date,
  endDate: date,
  dayPart: z.enum(['FULL_DAY', 'HALF_DAY', 'CUSTOM']),
  startTime: time.optional(),
  endTime: time.optional(),
  note: z.string().max(500).optional(),
});
const inboxSchema = z.object({ status: z.enum(['PENDING', 'ALL']).default('PENDING') });
const decisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().max(500).optional(),
});

/**
 * Leave requests. Who may do what is decided per request, by the rules in
 * leave.rules.ts, so there is no blanket role check here.
 */
@Controller('leave')
@UseGuards(SessionGuard)
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('types')
  types() {
    return this.leave.requestableTypes();
  }

  @Get('mine')
  mine(@CurrentUser() user: SessionUser) {
    return this.leave.mine(user);
  }

  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body({ schema: requestSchema }) dto: z.infer<typeof requestSchema>,
  ) {
    return this.leave.create(user, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.leave.cancel(user, id);
  }

  @Get('inbox')
  inbox(
    @CurrentUser() user: SessionUser,
    @Query({ schema: inboxSchema }) { status }: z.infer<typeof inboxSchema>,
  ) {
    return this.leave.inbox(user, status === 'PENDING');
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body({ schema: decisionSchema }) { approve, note }: z.infer<typeof decisionSchema>,
  ) {
    return this.leave.decide(user, id, approve, note);
  }
}
