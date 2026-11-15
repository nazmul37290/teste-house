import nodemailer from 'nodemailer';
import type { MailMessage, MailTransport } from './mail-transport';

export type SmtpConfig = { host: string; port: number; user?: string; pass?: string; from: string };

/** SMTP via nodemailer. Development points it at Mailpit (localhost:1025, no auth). */
export function createSmtpTransport(config: SmtpConfig): MailTransport {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {}),
  });
  return {
    async send(message: MailMessage) {
      const { tags: _tags, ...fields } = message; // tags are a Mailgun feature; SMTP ignores them
      const info = await transporter.sendMail({ from: config.from, ...fields });
      return { providerMessageId: info.messageId };
    },
  };
}
