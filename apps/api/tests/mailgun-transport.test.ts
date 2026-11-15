import { describe, expect, it, vi } from 'vitest';
import { createMailgunTransport } from '../src/integrations/mail/mailgun-transport';

const config = {
  apiKey: 'key-123',
  domain: 'mg.example.com',
  baseUrl: 'https://api.eu.mailgun.net/',
  from: 'Shop <no-reply@example.com>',
};
const message = { to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' };

describe('Mailgun transport', () => {
  it('posts the documented form fields with basic auth (user "api")', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ id: '<20261116.1@mg.example.com>', message: 'Queued. Thank you.' }),
    );
    const result = await createMailgunTransport(config, fetchImpl).send(message);

    expect(result.providerMessageId).toBe('<20261116.1@mg.example.com>');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.eu.mailgun.net/v3/mg.example.com/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Basic ${Buffer.from('api:key-123').toString('base64')}`,
    );
    const body = init.body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({ from: config.from, ...message });
  });

  it('sends each tag as a repeated o:tag field', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: 'x', message: 'Queued.' }));
    await createMailgunTransport(config, fetchImpl).send({
      ...message,
      tags: ['email-verify', 'auth'],
    });
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as URLSearchParams;
    expect(body.getAll('o:tag')).toEqual(['email-verify', 'auth']);
    expect(body.has('tags')).toBe(false);
  });

  it('throws on a non-2xx response without leaking the API key', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 401 }),
    );
    const error = await createMailgunTransport(config, fetchImpl)
      .send(message)
      .catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('HTTP 401');
    expect((error as Error).message).not.toContain('key-123');
  });
});
