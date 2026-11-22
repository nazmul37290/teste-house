'use client';

import { LEGAL_PAGE_MAX_LENGTH } from '@shop/shared';
import { useState } from 'react';
import { PageText } from '@/components/page-text';
import { Alert, Button, Card, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { LegalPage } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';
import { useAction } from '@/lib/use-action';

const HELP: [example: string, result: string][] = [
  ['## Heading', 'a section heading'],
  ['### Smaller heading', 'a sub-heading'],
  ['- item', 'a bullet list'],
  ['1. item', 'a numbered list'],
  ['**words**', 'bold'],
  ['an empty line', 'a new paragraph'],
];

/** Plain text box with a live preview that renders exactly like the shop page. */
export function PageEditor({ page }: { page: LegalPage }) {
  const [body, setBody] = useState(page.body);
  const [saved, setSaved] = useState(page);
  const { busy, status, error, run } = useAction();
  const dirty = body.trim() !== saved.body;
  const bodyError = error?.fieldError('body');

  const save = (next: string, message: string) =>
    run(async () => {
      const result = await api<LegalPage>(`/admin/pages/${page.slug}`, {
        method: 'PUT',
        body: { body: next },
      });
      setSaved(result);
      setBody(result.body);
      return result;
    }, message);

  const clear = () => {
    const question = `Remove the text of the ${page.title.toLowerCase()}? The shop will say the page is being prepared.`;
    if (window.confirm(question)) void save('', 'Page cleared.');
  };

  return (
    <div className="space-y-4">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Text">
          <label htmlFor="page-body" className="sr-only">
            {page.title} text
          </label>
          <Textarea
            id="page-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={24}
            maxLength={LEGAL_PAGE_MAX_LENGTH}
            aria-invalid={bodyError ? true : undefined}
            aria-describedby="page-body-help"
            className="mt-3 min-h-96 leading-relaxed"
            placeholder={
              '## Who we are\nWrite the policy here. Leave an empty line between paragraphs.'
            }
          />
          {bodyError ? <p className="mt-1 text-sm text-danger">{bodyError}</p> : null}
          <div id="page-body-help" className="mt-3 text-sm text-ink-muted">
            <p className="font-semibold text-ink">Formatting</p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {HELP.map(([example, result]) => (
                <div key={example} className="contents">
                  <dt>
                    <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-[13px] text-ink">
                      {example}
                    </code>
                  </dt>
                  <dd>{result}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Card>
        <Card title="Preview" description="How shoppers will see it.">
          <div className="mt-4 max-h-[44rem] overflow-y-auto rounded-control border border-line bg-rice p-5">
            <h2 className="font-display text-[28px] leading-tight text-petrol">{page.title}</h2>
            <div className="mt-4">
              {body.trim() ? (
                <PageText text={body} />
              ) : (
                <p className="text-sm text-ink-muted">
                  Nothing written yet. The shop says this page is being prepared.
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy || !dirty}
          onClick={() => save(body, 'Page saved. The shop shows it now.')}
        >
          {busy ? 'Saving…' : 'Save page'}
        </Button>
        <a
          href={page.path}
          target="_blank"
          rel="noopener"
          className="text-sm font-semibold text-petrol hover:underline"
        >
          Open in the shop
        </a>
        {saved.body ? (
          <Button variant="ghost" disabled={busy} onClick={clear}>
            Clear page
          </Button>
        ) : null}
        <span className="text-sm text-ink-muted">
          {dirty
            ? 'Unsaved changes'
            : saved.updatedAt
              ? `Last saved ${formatDhaka(saved.updatedAt)}`
              : null}
        </span>
      </div>
    </div>
  );
}
