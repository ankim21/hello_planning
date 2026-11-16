import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

export interface AuditEntry {
  actorUserId?: string;
  actorDeviceId?: string;
  /** "<entity>.<verb>", for example "shift.create". */
  action: string;
  entity: string;
  entityId: string;
  data?: object;
}

/** Records who did what. Call it from every write that matters. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: entry });
  }
}
