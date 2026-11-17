import {
  BadRequestException,
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
import { PasswordLinkService } from './password-link.service.js';
import { hashSecret, verifySecret } from './password.js';

const loginSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  password: z.string().min(1),
});
type LoginDto = z.infer<typeof loginSchema>;

export const MIN_PASSWORD_LENGTH = 10;
const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères`);
const forgotSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
});
const setPasswordSchema = z.object({ token: z.string().min(20), newPassword });
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères`),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly links: PasswordLinkService,
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

  /**
   * "Mot de passe oublié". Always answers the same, so nobody can learn from
   * it whether an address has an account.
   */
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(
    @Body({ schema: forgotSchema }) { email }: z.infer<typeof forgotSchema>,
  ) {
    await this.links.sendReset(email);
    return { ok: true };
  }

  /** Chooses a password with the one-time link received by e-mail. */
  @Post('set-password')
  @HttpCode(200)
  async setPassword(
    @Body({ schema: setPasswordSchema }) dto: z.infer<typeof setPasswordSchema>,
  ) {
    await this.links.consume(dto.token, dto.newPassword);
    return { ok: true };
  }

  /** Anyone changes their own password, knowing the current one. */
  @Post('change-password')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Body({ schema: changePasswordSchema }) dto: z.infer<typeof changePasswordSchema>,
  ) {
    const account = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifySecret(account.passwordHash, dto.currentPassword))) {
      throw new BadRequestException('Le mot de passe actuel est incorrect');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashSecret(dto.newPassword),
        mustChangePassword: false,
      },
    });
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: SessionUser) {
    return user;
  }
}
