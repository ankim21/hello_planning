import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { MeService } from './me.service.js';

const weekSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'), // a Monday
});
type WeekDto = z.infer<typeof weekSchema>;

// Digits, spaces, dots, dashes, an optional leading +. Empty removes it.
const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d .-]{6,20}$/, 'Numéro de téléphone invalide')
    .nullable(),
});

/** "Mon espace": every call here is about the logged-in person only. */
@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  overview(@CurrentUser() user: SessionUser) {
    return this.me.overview(user);
  }

  @Put('phone')
  setPhone(
    @CurrentUser() user: SessionUser,
    @Body({ schema: phoneSchema }) { phone }: z.infer<typeof phoneSchema>,
  ) {
    return this.me.setPhone(user, phone);
  }

  @Get('week')
  week(@CurrentUser() user: SessionUser, @Query({ schema: weekSchema }) { from }: WeekDto) {
    return this.me.week(user, from);
  }

  @Get('sites/:siteId/week')
  siteWeek(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Query({ schema: weekSchema }) { from }: WeekDto,
  ) {
    return this.me.siteWeek(user, siteId, from);
  }
}
