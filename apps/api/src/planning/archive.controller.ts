import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { ArchiveService } from './archive.service.js';

const requestSchema = z.object({ reason: z.string().max(300).optional() });
const decisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().max(300).optional(),
});

/** Asking HR to archive an employee, and HR's answer. */
@Controller()
@UseGuards(SessionGuard)
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  @Post('sites/:siteId/employees/:employeeId/archive-request')
  request(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Param('employeeId') employeeId: string,
    @Body({ schema: requestSchema }) { reason }: z.infer<typeof requestSchema>,
  ) {
    return this.archive.request(user, siteId, employeeId, reason);
  }

  @Get('archive-requests')
  inbox(@CurrentUser() user: SessionUser) {
    return this.archive.inbox(user);
  }

  @Post('archive-requests/:id/decision')
  decide(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body({ schema: decisionSchema }) { approve, note }: z.infer<typeof decisionSchema>,
  ) {
    return this.archive.decide(user, id, approve, note);
  }

  @Post('archive-requests/:id/cancel')
  cancel(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.archive.cancel(user, id);
  }
}
