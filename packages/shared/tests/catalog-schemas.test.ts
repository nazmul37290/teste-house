import { describe, expect, it } from 'vitest';
import { createCategorySchema, slugify, slugSchema } from '../src/catalog-schemas';

describe('slugify', () => {
  it.each([
    ['Pure Honey (500 g)!', 'pure-honey-500-g'],
    ['  Horlicks   Classic Malt ', 'horlicks-classic-malt'],
    ['Tea & Coffee', 'tea-and-coffee'],
    ['Café Crème', 'cafe-creme'],
    ['---', ''],
    ['মধু', ''], // no ASCII: the admin must type a slug
  ])('%j -> %j', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('never exceeds 120 characters or ends with a hyphen', () => {
    const s = slugify('word '.repeat(40));
    expect(s.length).toBeLessThanOrEqual(120);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('slug and category schemas', () => {
  it('accepts clean slugs only', () => {
    expect(slugSchema.parse('Pure-Honey')).toBe('pure-honey');
    for (const bad of ['pure honey', 'pure--honey', '-honey', 'honey-', 'মধু', 'a/b']) {
      expect(slugSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('rejects unknown fields', () => {
    expect(createCategorySchema.safeParse({ name: 'Honey', productCount: 3 }).success).toBe(false);
  });
});
