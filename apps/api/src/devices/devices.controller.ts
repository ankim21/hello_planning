import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';
import { hashDeviceToken } from './device.guard.js';

const registerSchema = z.object({ name: z.string().trim().min(1).max(60) });
type RegisterDto = z.infer<typeof registerSchema>;

/** Registering and revoking the time-clock tablets of a site. */
@Controller()
@UseGuards(SessionGuard)
export class DevicesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  @Get('sites/:siteId/devices')
  list(@CurrentUser() user: SessionUser, @Param('siteId') siteId: string) {
    this.access.assert(user, 'device.manage', siteId);
    return this.prisma.device.findMany({
      where: { siteId },
      select: { id: true, name: true, createdAt: true, revokedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Returns the token once; it cannot be read again afterwards. */
  @Post('sites/:siteId/devices')
  async register(
    @CurrentUser() user: SessionUser,
    @Param('siteId') siteId: string,
    @Body({ schema: registerSchema }) { name }: RegisterDto,
  ) {
    this.access.assert(user, 'device.manage', siteId);
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new NotFoundException();

    const token = randomBytes(32).toString('base64url');
    const device = await this.prisma.device.create({
      data: { name, siteId, tokenHash: hashDeviceToken(token) },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'device.register',
      entity: 'Device',
      entityId: device.id,
      data: { name, siteId },
    });
    return { id: device.id, name, token };
  }

  @Delete('devices/:id')
  async revoke(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    const device = await this.prisma.device.findUnique({ where: { id } });
    if (!device) throw new NotFoundException();
    this.access.assert(user, 'device.manage', device.siteId);
    await this.prisma.device.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'device.revoke',
      entity: 'Device',
      entityId: id,
    });
    return { ok: true };
  }
}
