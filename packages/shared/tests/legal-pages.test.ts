import { describe, expect, it } from 'vitest';
import { parsePageText, parseRuns, updateLegalPageSchema } from '../src/legal-pages';

describe('policy page text', () => {
  it('reads headings, paragraphs and both kinds of list', () => {
    const blocks = parsePageText(
      [
        '## Returns',
        'You can return a sealed item',
        'within 3 days.',
        '',
        '- Keep the receipt',
        '* Keep the box',
        '1. Call us',
        '2. Hand it to the courier',
        '### Refunds',
        'Paid back to **bKash** or cash.',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'heading',
      'paragraph',
    ]);
    expect(blocks[1]).toEqual({
      type: 'paragraph',
      lines: [
        [{ text: 'You can return a sealed item', bold: false }],
        [{ text: 'within 3 days.', bold: false }],
      ],
    });
    expect(blocks[2]).toMatchObject({
      ordered: false,
      items: [[{ text: 'Keep the receipt' }], [{ text: 'Keep the box' }]],
    });
    expect(blocks[3]).toMatchObject({ ordered: true });
    expect(blocks[4]).toMatchObject({ type: 'heading', level: 3 });
    expect(blocks[5]).toMatchObject({
      lines: [
        [
          { text: 'Paid back to ', bold: false },
          { text: 'bKash', bold: true },
          { text: ' or cash.', bold: false },
        ],
      ],
    });
  });

  it('never yields markup: HTML stays text', () => {
    const blocks = parsePageText('<script>alert(1)</script>');
    expect(blocks).toEqual([
      { type: 'paragraph', lines: [[{ text: '<script>alert(1)</script>', bold: false }]] },
    ]);
  });

  it('keeps an unmatched ** as typed; a single # is a section heading, not a second title', () => {
    expect(parseRuns('5 ** 2')).toEqual([{ text: '5 ** 2', bold: false }]);
    expect(parsePageText('# Title')[0]).toMatchObject({ type: 'heading', level: 2 });
  });

  it('normalises line endings and trims; refuses very long text and extra fields', () => {
    expect(updateLegalPageSchema.parse({ body: '  a  \r\nb\r\n\r\n' }).body).toBe('a\nb');
    expect(updateLegalPageSchema.safeParse({ body: 'x'.repeat(50_001) }).success).toBe(false);
    expect(updateLegalPageSchema.safeParse({ body: 'a', title: 'x' }).success).toBe(false);
  });
});
