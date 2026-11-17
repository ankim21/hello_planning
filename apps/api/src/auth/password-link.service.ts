import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { config } from '../config.js';
import { MailService } from '../core/mail.service.js';
import { PrismaService } from '../core/prisma.service.js';
import type { PasswordTokenPurpose } from '../generated/prisma/enums.js';
import { hashSecret } from './password.js';

const HOUR = 3_600_000;
/** An invitation leaves a week to react; a reset is used straight away. */
const VALIDITY: Record<PasswordTokenPurpose, number> = {
  INVITE: 7 * 24 * HOUR,
  RESET: HOUR,
};

// The token is long and random, so a fast hash is enough (unlike passwords).
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * One-time links to choose a password, sent by e-mail. The password itself
 * never travels by e-mail: the link opens a page where the person types it.
 */
@Injectable()
export class PasswordLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** E-mails a link to the account's address. False if it could not be sent. */
  async send(
    user: { id: string; email: string },
    purpose: PasswordTokenPurpose,
  ): Promise<boolean> {
    if (!this.mail.enabled) return false;
    const token = randomBytes(32).toString('base64url');
    await this.prisma.passwordToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        purpose,
        expiresAt: new Date(Date.now() + VALIDITY[purpose]),
      },
    });
    const link = `${config.APP_URL}/mot-de-passe?token=${token}`;
    return this.mail.send(
      purpose === 'INVITE'
        ? {
            to: user.email,
            subject: 'Votre accès à PLANetBAO',
            paragraphs: [
              'Bonjour,',
              'Un compte PLANetBAO vient d’être créé pour vous. Vous y trouverez votre planning, vos restaurants et vos demandes de congé.',
              'Choisissez votre mot de passe pour vous connecter :',
              link,
              'Ce lien est valable 7 jours et ne fonctionne qu’une fois.',
            ],
          }
        : {
            to: user.email,
            subject: 'Choisir un nouveau mot de passe PLANetBAO',
            paragraphs: [
              'Bonjour,',
              'Voici le lien pour choisir un nouveau mot de passe :',
              link,
              'Ce lien est valable 1 heure et ne fonctionne qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe ne change pas.',
            ],
          },
    );
  }

  /** "Mot de passe oublié": at most one e-mail every five minutes. */
  async sendReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.isActive) return; // the caller answers the same either way
    const recent = await this.prisma.passwordToken.findFirst({
      where: {
        userId: user.id,
        purpose: 'RESET',
        createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
      },
    });
    if (!recent) await this.send(user, 'RESET');
  }

  /** Uses a link once: sets the password it was sent for. */
  async consume(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt < new Date() ||
      !record.user.isActive
    ) {
      throw new BadRequestException(
        'Ce lien n’est plus valable. Demandez-en un nouveau depuis la page de connexion.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash: await hashSecret(newPassword),
          mustChangePassword: false,
        },
      }),
      // This link, and any other still pending for the account, are spent.
      this.prisma.passwordToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);
  }
}
