import { describe, expect, it } from 'vitest';
import { escapeHtml, renderEmail } from '../src/jobs/email-templates';

describe('email templates', () => {
  it('escapes every interpolated value in HTML', () => {
    const out = renderEmail(
      'email-verify',
      { name: '<script>x</script>', url: 'https://x.test/?a=1&b="2"' },
      { name: 'Shop & Co' },
    );
    expect(out.html).not.toContain('<script>');
    expect(out.html).toContain('&lt;script&gt;');
    expect(out.html).toContain('a=1&amp;b=&quot;2&quot;');
    expect(out.html).toContain('Shop &amp; Co');
  });

  it('uses the store name from settings in subject and body', () => {
    const out = renderEmail(
      'password-reset',
      { name: 'Rahim', url: 'https://x.test/r' },
      { name: 'Honey House' },
    );
    expect(out.subject).toBe('Reset your Honey House password');
    expect(out.text).toContain('https://x.test/r');
    expect(out.text).toContain('1 hour');
  });

  it('states the 24 hour validity for verification links', () => {
    expect(renderEmail('email-verify', { name: 'A', url: 'u' }, { name: 'S' }).text).toContain(
      '24 hours',
    );
  });

  it('shows the logo from settings when set, else the name', () => {
    const withLogo = renderEmail(
      'email-verify',
      { name: 'A', url: 'u' },
      { name: 'Honey House', logoUrl: 'https://cdn.example.com/logo.png' },
    );
    expect(withLogo.html).toContain(
      '<img src="https://cdn.example.com/logo.png" alt="Honey House"',
    );
    expect(
      renderEmail('email-verify', { name: 'A', url: 'u' }, { name: 'Honey House' }).html,
    ).not.toContain('<img');
  });

  it('escapeHtml covers all five special characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
