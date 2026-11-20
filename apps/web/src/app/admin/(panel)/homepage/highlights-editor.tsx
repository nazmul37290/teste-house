'use client';

import { HIGHLIGHT_ICONS, MAX_HOME_HIGHLIGHTS, type HomeHighlight } from '@shop/shared';
import { useState } from 'react';
import { HIGHLIGHT_ICON } from '@/components/shop/icons';
import { Alert, Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useAction } from '@/lib/use-action';

const ICON_LABEL: Record<HomeHighlight['icon'], string> = {
  cash: 'Cash',
  truck: 'Delivery van',
  card: 'Card',
  route: 'Route',
  phone: 'Phone',
  bag: 'Shopping bag',
  heart: 'Heart',
  check: 'Tick',
  pin: 'Location pin',
  mail: 'Mail',
};

/**
 * The strip of up to four highlights under the home hero. While nothing is saved the shop builds it
 * from payment methods and delivery zones; the editor starts from that text so it is easy to adjust.
 */
export function HighlightsEditor({
  saved,
  automatic,
}: {
  saved: HomeHighlight[];
  automatic: HomeHighlight[];
}) {
  const isAutomatic = saved.length === 0;
  const [items, setItems] = useState<HomeHighlight[]>(isAutomatic ? automatic : saved);
  const { busy, status, error, run } = useAction();

  const update = (i: number, patch: Partial<HomeHighlight>) =>
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (from: number, to: number) =>
    setItems((list) => {
      const next = [...list];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it!);
      return next;
    });
  const save = (next: HomeHighlight[], message: string) =>
    run(async () => {
      const result = await api<HomeHighlight[]>('/admin/homepage/highlights', {
        method: 'PUT',
        body: { items: next },
      });
      if (!next.length) setItems(automatic);
      return result;
    }, message);
  const fieldErr = (i: number, key: string) => error?.fieldError(`items.${i}.${key}`);

  return (
    <Card
      title="Highlights under the hero"
      description="Up to four short points, for example how to pay or how delivery works. Keep each one true: shoppers rely on them."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <p className="text-sm">
          {isAutomatic ? <Badge tone="brand">Automatic</Badge> : <Badge tone="green">Custom</Badge>}{' '}
          <span className="text-ink-muted">
            {isAutomatic
              ? 'Built from your payment methods and delivery zones. Edit and save to use your own text.'
              : 'The shop shows your text below.'}
          </span>
        </p>
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
        <ol className="space-y-3">
          {items.map((it, i) => {
            const Icon = HIGHLIGHT_ICON[it.icon];
            return (
              <li key={i} className="rounded-card border border-line p-4">
                <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
                  <Field label="Icon" htmlFor={`hl-icon-${i}`}>
                    <div className="flex items-center gap-2">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-petrol-tint text-petrol">
                        <Icon />
                      </span>
                      <Select
                        id={`hl-icon-${i}`}
                        value={it.icon}
                        onChange={(e) =>
                          update(i, { icon: e.target.value as HomeHighlight['icon'] })
                        }
                      >
                        {HIGHLIGHT_ICONS.map((k) => (
                          <option key={k} value={k}>
                            {ICON_LABEL[k]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </Field>
                  <div className="space-y-3">
                    <Field label="Title" htmlFor={`hl-title-${i}`} error={fieldErr(i, 'title')}>
                      <Input
                        id={`hl-title-${i}`}
                        value={it.title}
                        maxLength={60}
                        onChange={(e) => update(i, { title: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="Text (optional)"
                      htmlFor={`hl-text-${i}`}
                      hint="One short sentence."
                      error={fieldErr(i, 'text')}
                    >
                      <Input
                        id={`hl-text-${i}`}
                        value={it.text}
                        maxLength={140}
                        onChange={(e) => update(i, { text: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-sm">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    className="font-semibold text-petrol disabled:opacity-30"
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, i + 1)}
                    className="font-semibold text-petrol disabled:opacity-30"
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                    className="ml-auto font-semibold text-danger"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-3">
          {items.length < MAX_HOME_HIGHLIGHTS ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setItems((list) => [...list, { icon: 'check', title: '', text: '' }])}
            >
              Add a highlight
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={busy || items.length === 0}
            onClick={() =>
              void save(items, 'Highlights saved. The shop shows them within a minute.')
            }
          >
            Save highlights
          </Button>
          {!isAutomatic ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void save([], 'Back to automatic highlights from payment methods and zones.')
              }
            >
              Use automatic highlights
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
