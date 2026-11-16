import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Called by the API worker after admin changes (cache.revalidate job, docs/design.md section 9).
 * Not part of /api/v1 (that path is rewritten to the API); protected by REVALIDATE_SECRET.
 */
const TAG = /^[a-z0-9][a-z0-9:_-]{0,99}$/;

function secretMatches(given: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-revalidate-secret'))) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: 'Bad secret' } },
      { status: 401 },
    );
  }
  const body = (await request.json().catch(() => null)) as { tags?: unknown } | null;
  const tags = Array.isArray(body?.tags)
    ? body.tags.filter((t): t is string => typeof t === 'string' && TAG.test(t))
    : [];
  if (!tags.length || tags.length > 20) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Send 1 to 20 cache tags' } },
      { status: 400 },
    );
  }
  // expire 0: the next visitor gets fresh data (a changed price must not be served stale).
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ data: { revalidated: tags } });
}
