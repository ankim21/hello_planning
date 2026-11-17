import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { EmployeesService } from './employees.service.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const employeeSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d .-]{6,20}$/, 'Numéro de téléphone invalide')
    .nullable()
    .default(null),
  primarySiteId: z.uuid(),
  otherSiteIds: z.array(z.uuid()).default([]),
  postIds: z.array(z.uuid()).default([]),
  contractType: z.enum(['CDI', 'CDD', 'EXTRA', 'APPRENTICE']),
  weeklyHours: z.number().min(0).max(60).nullable(),
  forfaitJours: z.boolean().default(false),
  startDate: date,
  pin: z.string().regex(/^\d{4}$/, 'Le code PIN fait 4 chiffres').optional(),
});
const createQuery = z.object({ forAccount: z.uuid().optional() });

/** Employee records. Every call needs an administrator of the organisation. */
@Controller('employees')
@UseGuards(SessionGuard)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly access: AccessService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    this.access.assert(user, 'account.manage', null);
    return this.employees.list();
  }

  /** `?forAccount=<id>` also links the new person to that account. */
  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Query({ schema: createQuery }) { forAccount }: z.infer<typeof createQuery>,
    @Body({ schema: employeeSchema }) dto: z.infer<typeof employeeSchema>,
  ) {
    this.access.assert(user, 'account.manage', null);
    return this.employees.create(user, dto, forAccount);
  }

  @Put(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body({ schema: employeeSchema }) dto: z.infer<typeof employeeSchema>,
  ) {
    this.access.assert(user, 'account.manage', null);
    return this.employees.update(user, id, dto);
  }
}
