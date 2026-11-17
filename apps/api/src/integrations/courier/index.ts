import type { Env } from '../../config/env';
import type { CourierAdapter } from './courier-adapter';

export { CourierError, type CourierAdapter, type CourierState } from './courier-adapter';

/**
 * The configured courier, or null. The Steadfast adapter is written only from Steadfast's official
 * API documentation (CLAUDE.md: never guess third-party endpoints). The docs are behind the merchant
 * login and have not been provided yet, so no real courier exists: booking reports
 * COURIER_NOT_CONFIGURED and the sync job does nothing. See docs/integrations.md section 1.
 */
export function createCourier(_env: Env): CourierAdapter | null {
  return null;
}
