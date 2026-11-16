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

/** Asia/Dhaka is UTC+6 all year (no daylight saving), so admin date inputs use a fixed offset. */
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** ISO (UTC) -> value for <input type="datetime-local">, shown in Dhaka time. */
export function toDhakaInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(new Date(iso).getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value, read as Dhaka time -> ISO with offset, or null when empty. */
export function fromDhakaInput(value: string): string | null {
  return value ? `${value}:00+06:00` : null;
}
