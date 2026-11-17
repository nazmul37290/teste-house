/**
 * Liveness of the web server only (container health check, uptime monitor). It does not call the
 * API, so an API outage does not make Docker restart a healthy web container.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
