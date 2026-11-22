import { describe, expect, it } from 'vitest';
import { PUBLIC_SETTING_KEYS, updateSettingsSchema } from '../src/settings';

describe('settings', () => {
  it('normalizes values: phone, email, GTM ID', () => {
    const v = updateSettingsSchema.parse({
      'store.phone': '+880 1712-345678',
      'store.email': ' Hello@Shop.COM ',
      'gtm.containerId': 'gtm-ab12cd3',
    });
    expect(v).toEqual({
      'store.phone': '01712345678',
      'store.email': 'hello@shop.com',
      'gtm.containerId': 'GTM-AB12CD3',
    });
  });

  it('allows clearing optional text values', () => {
    expect(
      updateSettingsSchema.parse({ 'store.phone': '', 'gtm.containerId': '', 'store.logo': null }),
    ).toEqual({
      'store.phone': '',
      'gtm.containerId': '',
      'store.logo': null,
    });
  });

  it.each([
    [{ 'store.name': '' }],
    [{ 'store.phone': '12345' }],
    [{ 'store.logo': 'javascript:alert(1)' }],
    [{ 'store.logo': '/relative.png' }],
    [{ 'gtm.containerId': 'UA-1234' }],
    [{ 'review.autoApprove': 'yes' }],
    [{ 'seo.defaultTitle': 'x'.repeat(71) }],
    [{ 'unknown.key': 'x' }],
    [{}],
  ])('rejects %j', (input) => {
    expect(updateSettingsSchema.safeParse(input).success).toBe(false);
  });

  it('keeps internal settings out of the public list', () => {
    expect(PUBLIC_SETTING_KEYS).toContain('store.name');
    expect(PUBLIC_SETTING_KEYS).not.toContain('notifications.adminEmail');
    expect(PUBLIC_SETTING_KEYS).not.toContain('review.autoApprove');
  });

  it('accepts GA4 and Pixel IDs in their own formats, or empty', () => {
    expect(
      updateSettingsSchema.parse({
        'ga4.measurementId': ' g-ab12cd34ef ',
        'meta.pixelId': '123456789012345',
      }),
    ).toMatchObject({ 'ga4.measurementId': 'G-AB12CD34EF', 'meta.pixelId': '123456789012345' });
    expect(updateSettingsSchema.safeParse({ 'ga4.measurementId': 'UA-1234-1' }).success).toBe(
      false,
    );
    expect(updateSettingsSchema.safeParse({ 'meta.pixelId': 'abc' }).success).toBe(false);
    expect(updateSettingsSchema.parse({ 'meta.pixelId': '' })).toMatchObject({
      'meta.pixelId': '',
    });
  });

  it('policy pages are not public settings', () => {
    expect(PUBLIC_SETTING_KEYS).toContain('ga4.measurementId');
    expect(PUBLIC_SETTING_KEYS).not.toContain('page.privacy');
  });
});
