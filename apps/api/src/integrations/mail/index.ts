import type { Env } from '../../config/env';
import { createMailgunTransport } from './mailgun-transport';
import type { MailTransport } from './mail-transport';
import { createSmtpTransport } from './smtp-transport';

export type { MailMessage, MailTransport } from './mail-transport';

export function createMailTransport(env: Env): MailTransport {
  if (env.MAIL_PROVIDER === 'mailgun') {
    if (!env.MAILGUN_API_KEY || !env.MAILGUN_DOMAIN) {
      throw new Error('MAIL_PROVIDER=mailgun needs MAILGUN_API_KEY and MAILGUN_DOMAIN');
    }
    return createMailgunTransport({
      apiKey: env.MAILGUN_API_KEY,
      domain: env.MAILGUN_DOMAIN,
      baseUrl: env.MAILGUN_BASE_URL || 'https://api.mailgun.net',
      from: env.MAIL_FROM,
    });
  }
  return createSmtpTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.MAIL_FROM,
  });
}
