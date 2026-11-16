import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { hashSecret } from '../auth/password.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';

const setPinSchema = z.object({ pin: z.string().regex(/^\d{4}$/) });
type SetPinDto = z.infer<typeof setPinSchema>;

@Controller()
@UseGuards(SessionGuard)
export class PeopleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Employees assigned to a site. Never returns the PIN hash. */
  @Get('sites/:siteId/employees')
  async employees(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
  ) {
    this.access.assert(user, 'employee.read', siteId);
    const employees = await this.prisma.employee.findMany({
      where: { isActive: true, assignments: { some: { siteId } } },
      include: { posts: { include: { post: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return employees.map((employee) => ({
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      hasPin: employee.pinHash !== null,
      posts: employee.posts.map(({ post }) => post),
    }));
  }

  @Put('employees/:id/pin')
  async setPin(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body({ schema: setPinSchema }) { pin }: SetPinDto,
  ) {
    this.access.assert(user, 'employee.setPin', null);
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException();
    await this.prisma.employee.update({
      where: { id },
      data: { pinHash: await hashSecret(pin) },
    });
    // The PIN itself is never written to the audit log.
    await this.audit.record({
      actorUserId: user.id,
      action: 'employee.setPin',
      entity: 'Employee',
      entityId: id,
    });
    return { ok: true };
  }
}
