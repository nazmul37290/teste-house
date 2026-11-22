import { parsePageText, type TextRun } from '@shop/shared';
import { Fragment } from 'react';

/**
 * Renders policy page text (the small format in packages/shared legal-pages.ts) as React elements.
 * No HTML from the text is ever injected; used by the storefront and the admin preview.
 */
function Runs({ runs }: { runs: TextRun[] }) {
  return runs.map((r, i) =>
    r.bold ? (
      <strong key={i} className="font-semibold text-ink">
        {r.text}
      </strong>
    ) : (
      <Fragment key={i}>{r.text}</Fragment>
    ),
  );
}

export function PageText({ text }: { text: string }) {
  return (
    <div className="space-y-4 leading-relaxed text-neutral-700">
      {parsePageText(text).map((b, i) => {
        if (b.type === 'heading')
          return b.level === 2 ? (
            <h2 key={i} className="pt-4 font-display text-[22px] leading-snug text-petrol">
              <Runs runs={b.runs} />
            </h2>
          ) : (
            <h3 key={i} className="pt-2 text-lg font-semibold text-ink">
              <Runs runs={b.runs} />
            </h3>
          );
        if (b.type === 'list') {
          const List = b.ordered ? 'ol' : 'ul';
          return (
            <List
              key={i}
              className={`space-y-1.5 pl-6 ${b.ordered ? 'list-decimal' : 'list-disc'} marker:text-ink-muted`}
            >
              {b.items.map((item, j) => (
                <li key={j}>
                  <Runs runs={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                <Runs runs={line} />
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
