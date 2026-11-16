/**
 * Structured data for search engines (docs/design.md section 9). "<" is escaped so no text can end
 * the script element early. The escape is built with fromCharCode on purpose: written as a literal
 * here it has been turned into the raw character by tooling before.
 */
const LT_ESCAPE = `${String.fromCharCode(92)}u003c`;

export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, LT_ESCAPE) }}
    />
  );
}
