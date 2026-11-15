import type { MailMessage, MailTransport } from './mail-transport';

export type MailgunConfig = { apiKey: string; domain: string; baseUrl: string; from: string };

/**
 * Mailgun HTTP API, per the official docs (checked 2026-11-16):
 * POST {baseUrl}/v3/{domain}/messages, HTTP basic auth with user "api" and the API key, form fields
 * from, to, subject, text, html, and o:tag (repeatable). Success returns { id, message }. Base URL is https://api.mailgun.net
 * (US) or https://api.eu.mailgun.net (EU).
 */
export function createMailgunTransport(
  config: MailgunConfig,
  fetchImpl: typeof fetch = fetch,
): MailTransport {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/v3/${encodeURIComponent(config.domain)}/messages`;
  const authorization = `Basic ${Buffer.from(`api:${config.apiKey}`).toString('base64')}`;
  return {
    async send(message: MailMessage) {
      const { tags = [], ...fields } = message;
      const body = new URLSearchParams({ from: config.from, ...fields });
      for (const tag of tags) body.append('o:tag', tag);
      const res = await fetchImpl(url, { method: 'POST', headers: { authorization }, body });
      if (!res.ok) {
        // Mailgun error bodies are { message }; never include the request (it carries the API key header).
        const detail = await res.text().catch(() => '');
        throw new Error(`Mailgun send failed with HTTP ${res.status}: ${detail.slice(0, 200)}`);
      }
      const json = (await res.json()) as { id?: string };
      return { providerMessageId: json.id };
    },
  };
}
