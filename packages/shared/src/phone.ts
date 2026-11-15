/**
 * Normalize a Bangladeshi mobile number to 01XXXXXXXXX.
 * Accepts +8801..., 8801..., 008801..., 01..., 1... with spaces, dashes or brackets.
 * Returns null if the result is not a valid BD mobile number.
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('00880')) digits = digits.slice(2);
  if (digits.startsWith('880') && digits.length === 13) digits = `0${digits.slice(3)}`;
  else if (digits.length === 10 && digits.startsWith('1')) digits = `0${digits}`;
  return /^01[3-9]\d{8}$/.test(digits) ? digits : null;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginIdentifier = { type: 'email'; value: string } | { type: 'phone'; value: string };

/** Decide whether a login field holds an email or a phone number, normalized. */
export function parseLoginIdentifier(input: string): LoginIdentifier | null {
  const trimmed = input.trim();
  if (trimmed.includes('@')) {
    return EMAIL_RE.test(trimmed) ? { type: 'email', value: trimmed.toLowerCase() } : null;
  }
  const phone = normalizePhone(trimmed);
  return phone ? { type: 'phone', value: phone } : null;
}

/** Better Auth needs an email; phone-only customers get <phone>@phone.invalid (docs/auth.md decision 3). */
export const PLACEHOLDER_EMAIL_DOMAIN = 'phone.invalid';

export function placeholderEmailFor(normalizedPhone: string): string {
  return `${normalizedPhone}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

/** Placeholder addresses are never verified, never mailed and never used for guest-order linking. */
export function isPlaceholderEmail(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}
