import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../core/prisma.service.js';
import { SESSION_COOKIE, type SessionUser } from './session.js';

/**
 * Requires a valid login cookie. The user's rights are re-read from the
 * database on every request, so removing a role takes effect immediately.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token: string | undefined = request.cookies?.[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();

    let userId: string;
    try {
      userId = (await this.jwt.verifyAsync<{ sub: string }>(token)).sub;
    } catch {
      throw new UnauthorizedException();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roleGrants: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      employeeId: user.employeeId,
      mustChangePassword: user.mustChangePassword,
      grants: user.roleGrants.map(({ role, siteId }) => ({ role, siteId })),
    };
    request.user = sessionUser;
    return true;
  }
}
