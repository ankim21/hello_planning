import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../core/prisma.service.js';
import type { Department } from '../generated/prisma/enums.js';
import { type Action, can } from './permissions.js';
import type { SessionUser } from './session.js';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Everyone may look at the planning: people with a role through their
   * role, and plain employees for the sites they are assigned to.
   */
  async assertCanSeePlanning(user: SessionUser, siteId: string): Promise<void> {
    if (can(user.grants, 'shift.read', siteId)) return;
    const assigned =
      user.employeeId !== null &&
      (await this.prisma.siteAssignment.findUnique({
        where: { employeeId_siteId: { employeeId: user.employeeId, siteId } },
      })) !== null;
    if (!assigned) throw new ForbiddenException();
  }

  /** Stops the request with "403 Forbidden" unless the user has the right. */
  assert(
    user: SessionUser,
    action: Action,
    siteId: string | null,
    department?: Department,
  ): void {
    if (!can(user.grants, action, siteId, department)) {
      throw new ForbiddenException();
    }
  }

  /** Site ids the user has any grant on; null means all sites. */
  visibleSiteIds(user: SessionUser): string[] | null {
    if (user.grants.some((grant) => grant.siteId === null)) return null;
    return [...new Set(user.grants.map((grant) => grant.siteId!))];
  }
}
