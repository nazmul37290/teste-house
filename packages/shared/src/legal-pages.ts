import { z } from 'zod';

/**
 * Store policy pages the owner writes in the admin (`/admin/pages`). The text is stored in the
 * `settings` table (`page.<slug>`) and shown at a fixed path. Empty text: the page says it is being
 * prepared and stays out of search engines.
 */
export const LEGAL_PAGES = {
  privacy: { title: 'Privacy policy', path: '/privacy' },
  terms: { title: 'Terms and conditions', path: '/terms' },
  returns: { title: 'Return and refund policy', path: '/returns' },
} as const;

export type LegalPageSlug = keyof typeof LEGAL_PAGES;
export const LEGAL_PAGE_SLUGS = Object.keys(LEGAL_PAGES) as LegalPageSlug[];
export const legalPageSlugSchema = z.enum(LEGAL_PAGE_SLUGS as [LegalPageSlug, ...LegalPageSlug[]]);

export const LEGAL_PAGE_MAX_LENGTH = 50_000;

/** Line endings normalised, trailing spaces trimmed; plain text in the format below. */
export const legalPageBodySchema = z
  .string()
  .max(LEGAL_PAGE_MAX_LENGTH, `Keep the page under ${LEGAL_PAGE_MAX_LENGTH} characters`)
  .transform((v) =>
    v
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => l.trimEnd())
      .join('\n')
      .trim(),
  );

/** PUT /admin/pages/:slug (settings.manage). */
export const updateLegalPageSchema = z.strictObject({ body: legalPageBodySchema });

// Text format --------------------------------------------------------------------------------------
//
// Deliberately small, so the owner can write it in a plain text box and nothing can inject markup:
//   ## Heading           (### for a smaller heading)
//   - item  or  * item   (bullet list)
//   1. item              (numbered list)
//   **bold words**       (inside any line)
//   a blank line         (starts a new paragraph)

export type TextRun = { text: string; bold: boolean };
export type TextBlock =
  | { type: 'heading'; level: 2 | 3; runs: TextRun[] }
  | { type: 'paragraph'; lines: TextRun[][] }
  | { type: 'list'; ordered: boolean; items: TextRun[][] };

/** `**bold**` spans; an unmatched `**` stays as typed. */
export function parseRuns(line: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) runs.push({ text: line.slice(last, m.index), bold: false });
    runs.push({ text: m[1]!, bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) runs.push({ text: line.slice(last), bold: false });
  return runs;
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;

export function parsePageText(text: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let paragraph: TextRun[][] | null = null;
  let list: Extract<TextBlock, { type: 'list' }> | null = null;
  const close = () => {
    if (paragraph) blocks.push({ type: 'paragraph', lines: paragraph });
    if (list) blocks.push(list);
    paragraph = null;
    list = null;
  };

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      close();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      // "#" and "##" are both section headings: the page title is the only h1.
      blocks.push({
        type: 'heading',
        level: heading[1]!.length === 3 ? 3 : 2,
        runs: parseRuns(heading[2]!),
      });
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (paragraph || (list && list.ordered !== ordered)) close();
      list ??= { type: 'list', ordered, items: [] };
      list.items.push(parseRuns((bullet ?? numbered)![1]!));
      continue;
    }
    if (list) close();
    paragraph ??= [];
    paragraph.push(parseRuns(line));
  }
  close();
  return blocks;
}
