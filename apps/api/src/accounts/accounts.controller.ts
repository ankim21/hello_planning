import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { AccountsService } from './accounts.service.js';

const createSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  employeeId: z.uuid().nullable().default(null),
});
const activeSchema = z.object({ isActive: z.boolean() });
const grantSchema = z.object({
  role: z.enum([
    'HEAD_CHEF',
    'MANAGER',
    'SITE_DIRECTOR',
    'MULTI_SITE_MANAGER',
    'OPS',
    'HR',
    'ADMIN',
  ]),
  siteId: z.uuid().nullable().default(null),
});

/** Accounts and roles. Every call needs an administrator of the organisation. */
@Controller('accounts')
@UseGuards(SessionGuard)
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    this.access.assert(user, 'account.manage', null);
    return this.accounts.list();
  }

  @Get('options')
  options(@CurrentUser() user: SessionUser) {
    this.access.assert(user, 'account.manage', null);
    return this.accounts.options();
  }

  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body({ schema: createSchema }) dto: z.infer<typeof createSchema>,
  ) {
    this.access.assert(user, 'account.manage', null);
    return this.accounts.create(user, dto.email, dto.employeeId);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  resetPassword(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    this.access.assert(user, 'account.manage', null);
    return this.accounts.resetPassword(user, id);
  }

  @Put(':id/active')
  setActive(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body({ schema: activeSchema }) { isActive }: z.infer<typeof activeSchema>,
  ) {
    this.access.assert(user, 'account.manage', null);
    return this.accounts.setActive(user, id, isActive);
  }

  @Post(':id/grants')
  addGrant(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body({ schema: grantSchema }) { role, siteId }: z.infer<typeof grantSchema>,
  ) {
    this.access.assert(user, 'account.manage', null);
    return this.accounts.addGrant(user, id, role, siteId);
  }

  @Delete(':id/grants/:grantId')
  removeGrant(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Param('grantId') grantId: string,
  ) {
    this.access.assert(user, 'account.manage', null);
    return this.accounts.removeGrant(user, id, grantId);
  }
}
