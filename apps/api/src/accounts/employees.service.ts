import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SessionUser } from '../access/session.js';
import { hashSecret } from '../auth/password.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';
import type { ContractType } from '../generated/prisma/enums.js';

/** An employee as typed in the form. */
export interface EmployeeInput {
  firstName: string;
  lastName: string;
  phone: string | null;
  /** The main restaurant, then the others the person also works at. */
  primarySiteId: string;
  otherSiteIds: string[];
  postIds: string[];
  contractType: ContractType;
  /** Hours per week; null with forfait jours. */
  weeklyHours: number | null;
  forfaitJours: boolean;
  startDate: string; // YYYY-MM-DD
  /** 4 digits for the tablet; absent to leave it unchanged. */
  pin?: string;
}

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

/**
 * Employee records: who works where, on which posts, with which contract.
 * This is the person; an account (accounts.service.ts) is their login.
 *
 * Until PayFit is connected these records are entered by hand. Only what the
 * planning and the time clock need is kept here: no salary, no documents.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
      include: {
        user: { select: { id: true, email: true } },
        assignments: { include: { site: true }, orderBy: { isPrimary: 'desc' } },
        posts: { include: { post: true } },
        contracts: { orderBy: { startDate: 'desc' }, take: 1 },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return employees.map((employee) => {
      const contract = employee.contracts[0];
      return {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        phone: employee.phone,
        hasPin: employee.pinHash !== null,
        account: employee.user,
        primarySiteId: employee.assignments.find((a) => a.isPrimary)?.siteId ?? null,
        sites: employee.assignments.map((a) => ({
          id: a.siteId,
          name: a.site.name,
          isPrimary: a.isPrimary,
        })),
        postIds: employee.posts.map((p) => p.postId),
        contract: contract && {
          type: contract.type,
          weeklyHours: contract.weeklyHours === null ? null : Number(contract.weeklyHours),
          forfaitJours: contract.forfaitJours,
          startDate: contract.startDate.toISOString().slice(0, 10),
        },
      };
    });
  }

  /** Creates the person. `forUserId` links them to an account that has nobody yet. */
  async create(actor: SessionUser, input: EmployeeInput, forUserId?: string) {
    const site = await this.check(input);
    if (forUserId) {
      const user = await this.prisma.user.findUnique({ where: { id: forUserId } });
      if (!user) throw new BadRequestException('Compte inconnu');
      if (user.employeeId) throw new ConflictException('Ce compte a déjà une fiche salarié');
    }

    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          pinHash: input.pin ? await hashSecret(input.pin) : null,
          assignments: { create: this.assignments(input) },
          posts: { create: input.postIds.map((postId) => ({ postId })) },
          contracts: {
            create: {
              legalEntityId: site.legalEntityId,
              type: input.contractType,
              weeklyHours: input.forfaitJours ? null : input.weeklyHours,
              forfaitJours: input.forfaitJours,
              startDate: toDbDate(input.startDate),
            },
          },
        },
      });
      if (forUserId) {
        await tx.user.update({ where: { id: forUserId }, data: { employeeId: created.id } });
      }
      return created;
    });
    await this.record(actor, 'employee.create', employee.id, input);
    return { id: employee.id };
  }

  /**
   * Changes the person's details, restaurants and posts, and their current
   * contract. Past shifts are untouched.
   */
  async update(actor: SessionUser, id: string, input: EmployeeInput) {
    const existing = await this.prisma.employee.findUnique({
      where: { id },
      include: { contracts: { orderBy: { startDate: 'desc' }, take: 1 } },
    });
    if (!existing) throw new NotFoundException();
    const site = await this.check(input);
    const contract = {
      legalEntityId: site.legalEntityId,
      type: input.contractType,
      weeklyHours: input.forfaitJours ? null : input.weeklyHours,
      forfaitJours: input.forfaitJours,
      startDate: toDbDate(input.startDate),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          ...(input.pin ? { pinHash: await hashSecret(input.pin) } : {}),
        },
      });
      // Restaurants and posts are replaced by the new lists.
      await tx.siteAssignment.deleteMany({ where: { employeeId: id } });
      await tx.siteAssignment.createMany({
        data: this.assignments(input).map((a) => ({ ...a, employeeId: id })),
      });
      await tx.employeePost.deleteMany({ where: { employeeId: id } });
      await tx.employeePost.createMany({
        data: input.postIds.map((postId) => ({ postId, employeeId: id })),
      });
      const current = existing.contracts[0];
      if (current) await tx.contract.update({ where: { id: current.id }, data: contract });
      else await tx.contract.create({ data: { ...contract, employeeId: id } });
    });
    await this.record(actor, 'employee.update', id, input);
    return { id };
  }

  /** Every rule an employee record must pass. Returns the main site. */
  private async check(input: EmployeeInput) {
    const siteIds = [...new Set([input.primarySiteId, ...input.otherSiteIds])];
    const sites = await this.prisma.site.findMany({ where: { id: { in: siteIds } } });
    if (sites.length !== siteIds.length) throw new BadRequestException('Site inconnu');
    const posts = await this.prisma.post.count({ where: { id: { in: input.postIds } } });
    if (posts !== new Set(input.postIds).size) throw new BadRequestException('Poste inconnu');
    if (!input.forfaitJours && (input.weeklyHours === null || input.weeklyHours <= 0)) {
      throw new BadRequestException('Indiquez les heures par semaine du contrat');
    }
    return sites.find((site) => site.id === input.primarySiteId)!;
  }

  private assignments(input: EmployeeInput) {
    const others = [...new Set(input.otherSiteIds)].filter(
      (siteId) => siteId !== input.primarySiteId,
    );
    return [
      { siteId: input.primarySiteId, isPrimary: true },
      ...others.map((siteId) => ({ siteId, isPrimary: false })),
    ];
  }

  private async record(actor: SessionUser, action: string, id: string, input: EmployeeInput) {
    const { pin: _pin, ...withoutPin } = input; // the PIN never goes to the log
    await this.audit.record({
      actorUserId: actor.id,
      action,
      entity: 'Employee',
      entityId: id,
      data: withoutPin,
    });
  }
}
