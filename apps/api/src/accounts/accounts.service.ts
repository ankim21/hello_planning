import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../access/session.js';
import { PasswordLinkService } from '../auth/password-link.service.js';
import { hashSecret } from '../auth/password.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';
import type { Role } from '../generated/prisma/enums.js';

/** Roles held on one restaurant; the others cover the whole organisation. */
export const SITE_ROLES: Role[] = [
  'HEAD_CHEF',
  'MANAGER',
  'SITE_DIRECTOR',
  'MULTI_SITE_MANAGER',
];
export const ORGANISATION_ROLES: Role[] = ['OPS', 'HR', 'ADMIN'];

/** Letters and digits that cannot be confused when read aloud or copied. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

/** A password the administrator hands over; the person must replace it. */
function temporaryPassword(): string {
  return Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

/**
 * Accounts and roles, for the administrators of the organisation.
 * An account is a login; a role is what that login may do, on one restaurant
 * or everywhere. Linking an account to an employee gives that person
 * "Mon espace".
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly links: PasswordLinkService,
  ) {}

  async list() {
    const users = await this.prisma.user.findMany({
      include: {
        employee: true,
        roleGrants: { include: { site: true } },
      },
      orderBy: { email: 'asc' },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      employee: user.employee && {
        id: user.employee.id,
        firstName: user.employee.firstName,
        lastName: user.employee.lastName,
      },
      grants: user.roleGrants
        .map((grant) => ({
          id: grant.id,
          role: grant.role,
          site: grant.site && { id: grant.site.id, name: grant.site.name },
        }))
        .sort((a, b) => (a.site?.name ?? '').localeCompare(b.site?.name ?? '')),
    }));
  }

  /** What the screen needs to offer: the sites, and employees with no login yet. */
  async options() {
    const [sites, posts, employees] = await Promise.all([
      this.prisma.site.findMany({
        select: { id: true, name: true, type: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.post.findMany({
        where: { isActive: true },
        select: { id: true, name: true, department: true, color: true },
        orderBy: [{ department: 'desc' }, { name: 'asc' }],
      }),
      this.prisma.employee.findMany({
        where: { isActive: true, user: null },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);
    return { sites, posts, employeesWithoutAccount: employees };
  }

  /** Creates a login and invites the person by e-mail to choose a password. */
  async create(actor: SessionUser, email: string, employeeId: string | null) {
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Un compte existe déjà avec cet e-mail');
    }
    if (employeeId) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        include: { user: true },
      });
      if (!employee) throw new BadRequestException('Salarié inconnu');
      if (employee.user) {
        throw new ConflictException('Ce salarié a déjà un compte');
      }
    }
    // The account starts with a password nobody knows. The person chooses
    // theirs through the link e-mailed to them.
    const user = await this.prisma.user.create({
      data: {
        email,
        employeeId,
        passwordHash: await hashSecret(temporaryPassword() + temporaryPassword()),
      },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'account.create',
      entity: 'User',
      entityId: user.id,
      data: { email, employeeId }, // never a password
    });
    return { id: user.id, ...(await this.inviteOrFallBack(user, 'INVITE')) };
  }

  /**
   * E-mails the link to choose a password. If no e-mail can be sent (not set
   * up, or the server refuses), falls back to a temporary password that the
   * administrator passes on by hand.
   */
  private async inviteOrFallBack(
    user: { id: string; email: string },
    purpose: 'INVITE' | 'RESET',
  ): Promise<{ emailed: true } | { emailed: false; temporaryPassword: string }> {
    if (await this.links.send(user, purpose)) return { emailed: true };
    const password = temporaryPassword();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashSecret(password), mustChangePassword: true },
    });
    return { emailed: false, temporaryPassword: password };
  }

  /** For someone who forgot theirs: a new link by e-mail (or, failing that, a temporary password). */
  async resetPassword(actor: SessionUser, id: string) {
    const user = await this.userOrThrow(id);
    await this.audit.record({
      actorUserId: actor.id,
      action: 'account.resetPassword',
      entity: 'User',
      entityId: id,
    });
    // The current password keeps working until the link is used.
    return this.inviteOrFallBack(user, 'RESET');
  }

  /** A deactivated account can no longer log in; nothing is deleted. */
  async setActive(actor: SessionUser, id: string, isActive: boolean) {
    await this.userOrThrow(id);
    if (!isActive) {
      if (id === actor.id) {
        throw new BadRequestException('Vous ne pouvez pas désactiver votre propre compte');
      }
      await this.assertAnotherAdminRemains({ withoutUserId: id });
    }
    await this.prisma.user.update({ where: { id }, data: { isActive } });
    await this.audit.record({
      actorUserId: actor.id,
      action: isActive ? 'account.activate' : 'account.deactivate',
      entity: 'User',
      entityId: id,
    });
    return { ok: true };
  }

  async addGrant(actor: SessionUser, id: string, role: Role, siteId: string | null) {
    await this.userOrThrow(id);
    if (SITE_ROLES.includes(role) && !siteId) {
      throw new BadRequestException('Ce rôle se donne sur un site précis');
    }
    if (ORGANISATION_ROLES.includes(role) && siteId) {
      throw new BadRequestException("Ce rôle vaut pour toute l'organisation");
    }
    if (siteId && !(await this.prisma.site.findUnique({ where: { id: siteId } }))) {
      throw new BadRequestException('Site inconnu');
    }
    const existing = await this.prisma.roleGrant.findFirst({
      where: { userId: id, role, siteId },
    });
    if (existing) throw new ConflictException('Ce rôle est déjà attribué');

    const grant = await this.prisma.roleGrant.create({
      data: { userId: id, role, siteId },
    });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'account.grant',
      entity: 'User',
      entityId: id,
      data: { role, siteId },
    });
    return { id: grant.id };
  }

  async removeGrant(actor: SessionUser, id: string, grantId: string) {
    const grant = await this.prisma.roleGrant.findFirst({
      where: { id: grantId, userId: id },
    });
    if (!grant) throw new NotFoundException();
    if (grant.role === 'ADMIN' && grant.siteId === null) {
      await this.assertAnotherAdminRemains({ withoutGrantId: grantId });
    }
    await this.prisma.roleGrant.delete({ where: { id: grantId } });
    await this.audit.record({
      actorUserId: actor.id,
      action: 'account.revoke',
      entity: 'User',
      entityId: id,
      data: { role: grant.role, siteId: grant.siteId },
    });
    return { ok: true };
  }

  /** Never leave the organisation with nobody able to manage accounts. */
  private async assertAnotherAdminRemains(without: {
    withoutUserId?: string;
    withoutGrantId?: string;
  }) {
    const remaining = await this.prisma.roleGrant.count({
      where: {
        role: 'ADMIN',
        siteId: null,
        id: without.withoutGrantId ? { not: without.withoutGrantId } : undefined,
        user: {
          isActive: true,
          id: without.withoutUserId ? { not: without.withoutUserId } : undefined,
        },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException(
        'Il doit rester au moins un administrateur actif',
      );
    }
  }

  private async userOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    return user;
  }
}
