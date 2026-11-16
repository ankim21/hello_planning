import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { z } from 'zod';
import { SessionGuard } from '../access/session.guard.js';
import {
  CurrentUser,
  SESSION_COOKIE,
  type SessionUser,
} from '../access/session.js';
import { config } from '../config.js';
import { SESSION_DAYS } from '../core/core.module.js';
import { PrismaService } from '../core/prisma.service.js';
import { verifySecret } from './password.js';

const loginSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(1),
});
type LoginDto = z.infer<typeof loginSchema>;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body({ schema: loginSchema }) { email, password }: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok =
      user?.isActive && (await verifySecret(user.passwordHash, password));
    // Same answer whether the email or the password is wrong.
    if (!user || !ok) throw new UnauthorizedException('E-mail ou mot de passe incorrect');

    const token = await this.jwt.signAsync({ sub: user.id });
    // httpOnly: the page's JavaScript cannot read the cookie.
    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    });
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionUser) {
    return user;
  }
}
