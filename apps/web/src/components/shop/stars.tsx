/** Star rating with the number of reviews (display only). */
export function Stars({
  value,
  count,
  size = 'md',
}: {
  value: number;
  count?: number;
  size?: 'sm' | 'md';
}) {
  const rounded = Math.round(value * 2) / 2;
  const cls = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label={`Rated ${value.toFixed(1)} out of 5${count !== undefined ? ` from ${count} reviews` : ''}`}
    >
      <span className="flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = rounded >= n ? 1 : rounded >= n - 0.5 ? 0.5 : 0;
          return (
            <svg key={n} viewBox="0 0 20 20" className={cls}>
              <defs>
                <linearGradient id={`star-${n}-${fill}`}>
                  <stop offset={`${fill * 100}%`} stopColor="var(--color-haldi)" />
                  <stop offset={`${fill * 100}%`} stopColor="var(--color-neutral-300)" />
                </linearGradient>
              </defs>
              <path
                fill={`url(#star-${n}-${fill})`}
                d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z"
              />
            </svg>
          );
        })}
      </span>
      {count !== undefined ? (
        <span className={size === 'sm' ? 'text-xs text-ink-muted' : 'text-sm text-ink-muted'}>
          {value.toFixed(1)} ({count})
        </span>
      ) : null}
    </span>
  );
}
