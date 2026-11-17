'use client';

import { useEffect, useRef } from 'react';
import { track, trackEcommerce, type EcommerceEvent } from '@/lib/analytics';
import type { AnalyticsItem } from '@shop/shared';

/** Fires one event when a page mounts (view_item, search). Keyed on `id` to fire again on change. */
export function TrackOnce(
  props:
    | {
        id: string;
        kind: 'ecommerce';
        event: EcommerceEvent;
        items: AnalyticsItem[];
        extra?: Record<string, unknown>;
      }
    | { id: string; kind: 'search'; term: string },
) {
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (fired.current === props.id) return;
    fired.current = props.id;
    if (props.kind === 'search') track('search', { search_term: props.term });
    else trackEcommerce(props.event, { items: props.items, ...props.extra });
    // Fire once per id.
  }, [props.id]);
  return null;
}
