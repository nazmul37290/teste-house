import { formatDhaka } from '@/lib/format';
import { courierStatusText, type Shipment } from '@/lib/order-types';

/** Courier parcels with their tracking codes and status history (customer and admin views). */
export function ShipmentTimeline({ shipments }: { shipments: Shipment[] }) {
  if (!shipments.length) return null;
  return (
    <div className="space-y-4">
      {shipments.map((s, i) => (
        <div key={i} className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Courier tracking</span>
            {s.trackingCode ? <span className="font-mono"> {s.trackingCode}</span> : null}
            {s.trackingUrl ? (
              <>
                {' · '}
                <a
                  href={s.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Track on the courier site
                </a>
              </>
            ) : null}
          </p>
          <ol className="space-y-1 border-l-2 border-line pl-4">
            {s.events.map((e, j) => (
              <li key={j}>
                <span className="font-medium">{courierStatusText(e.status)}</span>
                {e.message ? <span className="text-neutral-600"> · {e.message}</span> : null}
                <span className="block text-xs text-neutral-500">{formatDhaka(e.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
