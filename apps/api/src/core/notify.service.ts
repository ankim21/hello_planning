import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

export interface Notice {
  title: string;
  body: string;
  /** Address inside the application that the notification opens. */
  link: string;
}

/** French date for messages: "mer. 18 nov.". Dates are YYYY-MM-DD. */
export function frenchDate(date: string): string {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * In-app notifications: messages people find behind the bell, in their
 * account. Nothing leaves the application (no e-mail, no push).
 *
 * A notification is a courtesy, never the record of anything: if writing one
 * fails, the action that caused it still succeeds.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** To accounts, by their id. `except` leaves out the person who acted. */
  async users(userIds: string[], notice: Notice, except?: string): Promise<void> {
    const recipients = [...new Set(userIds)].filter((id) => id !== except);
    if (recipients.length === 0) return;
    try {
      await this.prisma.notification.createMany({
        data: recipients.map((userId) => ({ userId, ...notice })),
      });
    } catch (error) {
      this.logger.error(`Notification not written: ${(error as Error).message}`);
    }
  }

  /** To employees, for those who have an account. */
  async employees(employeeIds: string[], notice: Notice, except?: string): Promise<void> {
    if (employeeIds.length === 0) return;
    const users = await this.prisma.user.findMany({
      where: { employeeId: { in: [...new Set(employeeIds)] }, isActive: true },
      select: { id: true },
    });
    await this.users(users.map((user) => user.id), notice, except);
  }
}
