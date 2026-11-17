import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

export interface Mail {
  to: string;
  subject: string;
  /** Plain paragraphs; a paragraph that is only a link becomes a button. */
  paragraphs: string[];
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Sends e-mail through the SMTP server named in SMTP_URL. With no SMTP_URL
 * the service is off: `enabled` is false and callers fall back to something
 * that needs no e-mail.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null = config.SMTP_URL
    ? nodemailer.createTransport(config.SMTP_URL)
    : null;

  get enabled(): boolean {
    return this.transport !== null;
  }

  /** Returns false when the e-mail could not be handed to the server. */
  async send(mail: Mail): Promise<boolean> {
    if (!this.transport) return false;
    const html = mail.paragraphs
      .map((paragraph) =>
        /^https?:\/\/\S+$/.test(paragraph)
          ? `<p><a href="${paragraph}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600">Ouvrir PLANetBAO</a></p><p style="color:#666b85;font-size:13px">Ou copiez ce lien : ${paragraph}</p>`
          : `<p>${escapeHtml(paragraph)}</p>`,
      )
      .join('');
    try {
      await this.transport.sendMail({
        from: config.MAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.paragraphs.join('\n\n'),
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#171a2b">${html}</div>`,
      });
      return true;
    } catch (error) {
      // The address is not logged: it is personal data.
      this.logger.error(`E-mail not sent: ${(error as Error).message}`);
      return false;
    }
  }
}
