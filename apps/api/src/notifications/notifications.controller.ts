import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { PrismaService } from '../core/prisma.service.js';

/** The bell: each account reads and clears its own notifications. */
@Controller('notifications')
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /** The 30 most recent, and how many are unread. */
  @Get()
  async list(@CurrentUser() user: SessionUser) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, title: true, body: true, link: true, createdAt: true, readAt: true },
      }),
      this.prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return { items, unread };
  }

  @Post('read-all')
  @HttpCode(200)
  async readAll(@CurrentUser() user: SessionUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  @Post(':id/read')
  @HttpCode(200)
  async read(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    // The account is part of the condition: nobody marks someone else's.
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
