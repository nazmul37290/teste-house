import { describe, expect, it } from 'vitest';
import { normalizePhone, parseLoginIdentifier } from '../src/phone';

describe('normalizePhone', () => {
  it.each([
    ['01712345678', '01712345678'],
    ['+8801712345678', '01712345678'],
    ['8801712345678', '01712345678'],
    ['008801712345678', '01712345678'],
    ['1712345678', '01712345678'],
    ['017-1234 5678', '01712345678'],
    ['+880 1712-345678', '01712345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', 'abc', '0171234567', '017123456789', '01212345678', '+8801212345678', '12345'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});

describe('parseLoginIdentifier', () => {
  it('detects email and lowercases it', () => {
    expect(parseLoginIdentifier(' Rahim@Example.COM ')).toEqual({
      type: 'email',
      value: 'rahim@example.com',
    });
  });
  it('detects phone and normalizes it', () => {
    expect(parseLoginIdentifier('+8801712345678')).toEqual({ type: 'phone', value: '01712345678' });
  });
  it('rejects garbage', () => {
    expect(parseLoginIdentifier('rahim@')).toBeNull();
    expect(parseLoginIdentifier('hello')).toBeNull();
  });
});
