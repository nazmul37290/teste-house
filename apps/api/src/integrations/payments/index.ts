import type { Env } from '../../config/env';
import type { PaymentGateway } from './payment-gateway';
import { createUddoktaPayGateway } from './uddoktapay';

export { GatewayError, type PaymentGateway, type VerifiedPayment } from './payment-gateway';
export { UDDOKTAPAY_KEY_HEADER } from './uddoktapay';

/** Gateways that are configured in this environment, by payment method code. */
export type Gateways = Record<string, PaymentGateway>;

export function createGateways(env: Env): Gateways {
  const gateways: Gateways = {};
  if (env.UDDOKTAPAY_BASE_URL && env.UDDOKTAPAY_API_KEY) {
    gateways.UDDOKTAPAY = createUddoktaPayGateway({
      baseUrl: env.UDDOKTAPAY_BASE_URL,
      apiKey: env.UDDOKTAPAY_API_KEY,
    });
  }
  return gateways;
}
