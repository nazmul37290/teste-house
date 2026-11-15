/** Times are stored in UTC and always shown in Asia/Dhaka (CLAUDE.md). */
const dhaka = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDhaka(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dhaka.format(typeof value === 'string' ? new Date(value) : value);
}

/** Only same-site relative paths, so ?next= can never send someone to another site. */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return fallback;
  return next;
}
