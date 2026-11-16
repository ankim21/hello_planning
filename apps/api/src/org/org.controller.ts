import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessService } from '../access/access.service.js';
import { can } from '../access/permissions.js';
import { SessionGuard } from '../access/session.guard.js';
import { CurrentUser, type SessionUser } from '../access/session.js';
import { AuditService } from '../core/audit.service.js';
import { PrismaService } from '../core/prisma.service.js';

const createPostSchema = z.object({
  name: z.string().trim().min(1).max(60),
  department: z.enum(['KITCHEN', 'SALLE']),
});
type CreatePostDto = z.infer<typeof createPostSchema>;

/** Sites and posts: the structure of the company. */
@Controller()
@UseGuards(SessionGuard)
export class OrgController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The sites the logged-in user can open: those they have a role on, and
   * those they work at. Each one says what the user may do there, so the
   * screens show only the tabs and buttons that will work.
   */
  @Get('sites')
  async sites(@CurrentUser() user: SessionUser) {
    const roleSites = this.access.visibleSiteIds(user);
    const sites = await this.prisma.site.findMany({
      where:
        roleSites === null
          ? {}
          : {
              OR: [
                { id: { in: roleSites } },
                { assignments: { some: { employeeId: user.employeeId ?? '' } } },
              ],
            },
      orderBy: { name: 'asc' },
    });
    return sites.map((site) => ({
      id: site.id,
      name: site.name,
      type: site.type,
      rights: {
        seeBadgeuse: can(user.grants, 'hours.read', site.id),
        manageTablets: can(user.grants, 'device.manage', site.id),
      },
    }));
  }

  @Get('posts')
  posts() {
    return this.prisma.post.findMany({
      where: { isActive: true },
      orderBy: [{ department: 'asc' }, { name: 'asc' }],
    });
  }

  @Post('posts')
  async createPost(
    @CurrentUser() user: SessionUser,
    @Body({ schema: createPostSchema }) dto: CreatePostDto,
  ) {
    this.access.assert(user, 'post.manage', null);
    const post = await this.prisma.post.create({ data: dto });
    await this.audit.record({
      actorUserId: user.id,
      action: 'post.create',
      entity: 'Post',
      entityId: post.id,
      data: dto,
    });
    return post;
  }
}
