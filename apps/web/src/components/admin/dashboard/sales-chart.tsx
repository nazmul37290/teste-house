'use client';

import { formatPaisa, formatTaka, parsePaisa } from '@shop/shared';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

type Point = { date: string; orders: number; sales: string };

const HEIGHT = 240; // plot
const AXIS = 28; // x-axis label band, inside the container (no clipped labels)
const PAD = { top: 20, right: 16, left: 56 };

/** Whole taka from a money string, for scaling only (values shown come from the strings). */
const taka = (s: string) => Math.round(parsePaisa(s) / 100);

/** Clean tick step for a max value: 1, 2 or 5 times a power of ten, about four ticks. */
function niceStep(max: number) {
  const raw = Math.max(max, 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
}
const compact = (n: number) =>
  n >= 100_000
    ? `${Math.round(n / 1000)}K`
    : n >= 10_000
      ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`
      : n.toLocaleString('en-US');

const dayLabel = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const longDay = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const asDate = (d: string) => new Date(`${d}T00:00:00Z`);

/**
 * Sales per day: one series, so one colour (petrol) and no legend; the card title names it.
 * 2px line, 10% area wash, hairline grid, crosshair tooltip on hover and with the arrow keys,
 * and the same figures as a table (tooltips never gate a value).
 */
export function SalesChart({ data }: { data: Point[] }) {
  const box = useRef<HTMLDivElement>(null);
  // Unknown until measured in the browser: nothing is drawn at a guessed size (no overflow).
  const [width, setWidth] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // Measure now as well: a ResizeObserver callback waits for the next rendered frame.
    setWidth(Math.max(280, el.clientWidth));
    const ro = new ResizeObserver(([e]) =>
      setWidth(Math.max(280, Math.round(e!.contentRect.width))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = useMemo(() => data.map((d) => taka(d.sales)), [data]);
  const max = Math.max(...values, 0);
  const step = niceStep(max);
  const top = Math.max(step * Math.ceil(max / step), step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const w = width ?? 0;
  const plotW = w - PAD.left - PAD.right;
  const x = (i: number) =>
    PAD.left + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  const y = (v: number) => PAD.top + HEIGHT - (v / top) * HEIGHT;
  const line = values
    .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join('');
  const area = `${line}L${x(values.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;

  // X labels: weekdays for a week, otherwise about six dates.
  // As many as fit (about one per 70px), and none crowding the last date.
  const fit = Math.max(2, Math.floor(plotW / 70));
  const every = Math.max(1, Math.ceil(data.length / fit));
  const showLabel = (i: number) =>
    i === data.length - 1 || (i % every === 0 && x(data.length - 1) - x(i) >= 70);
  const xLabel = (d: string) => (data.length <= 7 ? weekday : dayLabel).format(asDate(d));
  const peak = values.indexOf(max);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const i = Math.round(((px - PAD.left) / plotW) * (data.length - 1));
    setActive(Math.min(data.length - 1, Math.max(0, i)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      setActive((a) => Math.min(data.length - 1, Math.max(0, (a ?? data.length - 1) + d)));
    } else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(data.length - 1);
    else if (e.key === 'Escape') setActive(null);
  };

  const a = active === null ? null : data[active]!;
  const tipLeft = active === null ? 0 : x(active);
  const total = data.reduce((acc, d) => acc + parsePaisa(d.sales), 0);

  return (
    <div>
      <div
        ref={box}
        className="relative overflow-hidden"
        style={{ height: PAD.top + HEIGHT + AXIS }}
      >
        {width === null ? null : (
          <svg
            width={width}
            height={PAD.top + HEIGHT + AXIS}
            role="img"
            aria-label={`Sales per day, ${data[0]?.date} to ${data.at(-1)?.date}, total ${formatTaka(formatPaisa(total))}. Use the left and right arrow keys to read each day.`}
            tabIndex={0}
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="block touch-pan-y outline-none focus-visible:rounded-control focus-visible:ring-2 focus-visible:ring-petrol/30"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={w - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="var(--color-line)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 10}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-ink-muted text-[12px] tabular-nums"
                >
                  {compact(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              showLabel(i) ? (
                <text
                  key={d.date}
                  x={x(i)}
                  y={PAD.top + HEIGHT + 20}
                  textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                  className="fill-ink-muted text-[12px]"
                >
                  {xLabel(d.date)}
                </text>
              ) : null,
            )}
            <path d={area} fill="var(--color-petrol)" fillOpacity={0.1} />
            <path
              d={line}
              fill="none"
              stroke="var(--color-petrol)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* One direct label: the best day. */}
            {max > 0 && active === null ? (
              <text
                x={x(peak)}
                y={y(max) - 10}
                textAnchor={peak === 0 ? 'start' : peak === data.length - 1 ? 'end' : 'middle'}
                className="fill-ink text-[12px] font-semibold"
              >
                {formatTaka(data[peak]!.sales)}
              </text>
            ) : null}
            <circle
              cx={x(values.length - 1)}
              cy={y(values.at(-1) ?? 0)}
              r={4}
              fill="var(--color-petrol)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
            {active !== null ? (
              <>
                <line
                  x1={x(active)}
                  x2={x(active)}
                  y1={PAD.top}
                  y2={PAD.top + HEIGHT}
                  stroke="var(--color-ink-muted)"
                  strokeWidth={1}
                />
                <circle
                  cx={x(active)}
                  cy={y(values[active]!)}
                  r={5}
                  fill="var(--color-petrol)"
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                />
              </>
            ) : null}
          </svg>
        )}
        {a ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-control border border-line bg-surface px-3 py-2 text-sm shadow-raised"
            style={{
              left: Math.min(Math.max(tipLeft - 72, 0), w - 160),
            }}
          >
            <p className="text-[12px] text-ink-muted">{longDay.format(asDate(a.date))}</p>
            <p className="mt-0.5 flex items-center gap-2">
              <span aria-hidden className="h-0.5 w-3 rounded bg-petrol" />
              <span className="font-bold text-ink">{formatTaka(a.sales)}</span>
            </p>
            <p className="text-[12px] text-ink-muted">
              {a.orders} {a.orders === 1 ? 'order' : 'orders'}
            </p>
          </div>
        ) : null}
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer font-semibold text-petrol">Show as table</summary>
        <div className="mt-2 max-h-72 overflow-y-auto rounded-control border border-line">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-neutral-50 text-ink-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">Day</th>
                <th className="px-3 py-2 text-right font-semibold">Orders</th>
                <th className="px-3 py-2 text-right font-semibold">Sales</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <td className="px-3 py-1.5">{longDay.format(asDate(d.date))}</td>
                  <td className="px-3 py-1.5 text-right">{d.orders}</td>
                  <td className="px-3 py-1.5 text-right">{formatTaka(d.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
