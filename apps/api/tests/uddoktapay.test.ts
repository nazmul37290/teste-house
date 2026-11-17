import { describe, expect, it, vi } from 'vitest';
import {
  createUddoktaPayGateway,
  UDDOKTAPAY_KEY_HEADER,
} from '../src/integrations/payments/uddoktapay';

function mockFetch(response: unknown, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(response), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
}
const KEY = 'test-key-123';

describe('UddoktaPay gateway', () => {
  it('creates a charge with the documented body and header', async () => {
    const fetchImpl = mockFetch({
      status: true,
      message: 'Payment Url',
      payment_url: 'https://sandbox.uddoktapay.com/payment/abc123def',
    });
    const gw = createUddoktaPayGateway({
      baseUrl: 'https://sandbox.uddoktapay.com/',
      apiKey: KEY,
      fetchImpl,
    });
    const res = await gw.createCharge({
      orderNumber: 'ORD-000123',
      paymentId: 'pay-1',
      amount: 166000,
      customer: { name: 'Rahim', phone: '01712345678', email: 'r@example.com' },
      returnUrl: 'https://shop.test/payment/return',
      cancelUrl: 'https://shop.test/payment/return?cancelled=1',
      webhookUrl: 'https://api.shop.test/api/v1/webhooks/uddoktapay',
    });
    expect(res).toMatchObject({
      redirectUrl: 'https://sandbox.uddoktapay.com/payment/abc123def',
      gatewayInvoiceId: null,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://sandbox.uddoktapay.com/api/checkout-v2');
    const headers = init!.headers as Record<string, string>;
    expect(headers[UDDOKTAPAY_KEY_HEADER]).toBe(KEY);
    expect(headers.Accept).toBe('application/json');
    expect(JSON.parse(init!.body as string)).toEqual({
      full_name: 'Rahim',
      email: 'r@example.com',
      amount: '1660.00',
      metadata: { order_number: 'ORD-000123', payment_id: 'pay-1' },
      redirect_url: 'https://shop.test/payment/return',
      return_type: 'GET',
      cancel_url: 'https://shop.test/payment/return?cancelled=1',
      webhook_url: 'https://api.shop.test/api/v1/webhooks/uddoktapay',
    });
  });

  it('turns a refused charge into an error without leaking the key', async () => {
    const gw = createUddoktaPayGateway({
      baseUrl: 'https://x.test',
      apiKey: KEY,
      fetchImpl: mockFetch({ status: false, message: 'Invalid API key' }, 400),
    });
    const call = gw.createCharge({
      orderNumber: 'ORD-1',
      paymentId: 'p',
      amount: 100,
      customer: { name: 'a', phone: '0', email: 'a@b.c' },
      returnUrl: 'https://a',
      cancelUrl: 'https://a',
      webhookUrl: 'https://a',
    });
    await expect(call).rejects.toThrow('Invalid API key');
    await expect(call).rejects.not.toThrow(KEY);
  });

  it.each([
    ['COMPLETED', 'SUCCESS'],
    ['PENDING', 'PENDING'],
    ['ERROR', 'FAILED'],
  ])('maps verify status %s to %s and reads the amount as paisa', async (provider, ours) => {
    const fetchImpl = mockFetch({
      full_name: 'Rahim',
      email: 'r@example.com',
      amount: '1660.00',
      fee: '0.00',
      charged_amount: '1660.00',
      invoice_id: 'abc123def',
      metadata: { order_number: 'ORD-000123', payment_id: 'pay-1' },
      payment_method: 'bkash',
      sender_number: '01700000000',
      transaction_id: 'TXN123',
      date: '2026-11-17 14:00:50',
      status: provider,
    });
    const gw = createUddoktaPayGateway({ baseUrl: 'https://x.test', apiKey: KEY, fetchImpl });
    const v = await gw.verify({ gatewayInvoiceId: 'abc123def' });
    expect(v).toMatchObject({
      status: ours,
      amount: 166000,
      gatewayInvoiceId: 'abc123def',
      gatewayTxnId: 'TXN123',
      orderNumber: 'ORD-000123',
      paymentId: 'pay-1',
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://x.test/api/verify-payment');
    expect(JSON.parse(init!.body as string)).toEqual({ invoice_id: 'abc123def' });
  });

  it('treats "No Data Found" from verify as still pending, not failed', async () => {
    const gw = createUddoktaPayGateway({
      baseUrl: 'https://x.test',
      apiKey: KEY,
      fetchImpl: mockFetch({ status: 'ERROR', message: 'No Data Found' }),
    });
    expect(await gw.verify({ gatewayInvoiceId: 'nope' })).toMatchObject({
      status: 'PENDING',
      amount: null,
    });
  });

  it('treats an empty status (invoice not paid yet, as the sandbox returns) as pending', async () => {
    const gw = createUddoktaPayGateway({
      baseUrl: 'https://x.test',
      apiKey: KEY,
      fetchImpl: mockFetch({ status: '', invoice_id: 'inv12345', amount: '440.00' }),
    });
    expect((await gw.verify({ gatewayInvoiceId: 'inv12345' })).status).toBe('PENDING');
  });

  it('treats ERROR for a known invoice as FAILED', async () => {
    const gw = createUddoktaPayGateway({
      baseUrl: 'https://x.test',
      apiKey: KEY,
      fetchImpl: mockFetch({ status: 'ERROR', invoice_id: 'inv12345', amount: '10.00' }),
    });
    expect((await gw.verify({ gatewayInvoiceId: 'inv12345' })).status).toBe('FAILED');
  });
});
