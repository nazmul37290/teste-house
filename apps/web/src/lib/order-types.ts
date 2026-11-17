/** Checkout and order shapes returned by the API (apps/api order.service). Money is a string. */

export type QuoteLine = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  listPrice: string;
  unitPrice: string;
  lineTotal: string;
  discountAmount: string;
};

export type Quote = {
  lines: QuoteLine[];
  subtotal: string;
  discountTotal: string;
  deliveryCharge: string;
  grandTotal: string;
  zone: {
    name: string;
    charge: string;
    freeDeliveryThreshold: string | null;
    estimatedDays: string | null;
  };
  coupon: { code: string; applied: boolean; reason?: string; message?: string } | null;
  paymentMethods: { code: string; name: string }[];
};

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'HANDED_TO_COURIER'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED'
  | 'FAILED';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Order placed',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Being packed',
  HANDED_TO_COURIER: 'With the courier',
  IN_TRANSIT: 'On the way',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
  FAILED: 'Delivery failed',
};

export type OrderAddress = {
  recipientName: string;
  phone: string;
  division: string;
  district: string;
  upazila: string | null;
  addressLine: string;
  postalCode: string | null;
  deliveryNote: string | null;
};

export type OrderView = {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  placedAt: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string | null;
  couponCode: string | null;
  subtotal: string;
  discountTotal: string;
  deliveryCharge: string;
  grandTotal: string;
  paymentMethod: { code: string; name: string };
  deliveryZone: { name: string; estimatedDays: string | null } | null;
  address: (Partial<OrderAddress> & { district: string; division: string }) | null;
  items: {
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    discountAmount: string;
  }[];
  timeline: { status: OrderStatus; at: string }[];
  shipments?: Shipment[];
  /** Only on the response that placed an online order: where to pay, or why paying could not start. */
  payment?: { redirectUrl: string } | { error: string } | null;
};

/** The order just placed, kept for the confirmation page (this tab only). */
export const LAST_ORDER_KEY = 'shop:last-order';

/** A saved customer address (/me/addresses). */
export type SavedAddress = {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  division: string;
  district: string;
  upazila: string | null;
  addressLine: string;
  postalCode: string | null;
  isDefault: boolean;
};

/** A row of the customer's order history (/me/orders). */
export type OrderListItem = {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  placedAt: string;
  grandTotal: string;
  itemCount: number;
  paymentMethod: { name: string };
};

/** Badge colour per status in the admin. */
export const STATUS_TONE: Record<OrderStatus, 'green' | 'amber' | 'neutral'> = {
  PENDING: 'amber',
  CONFIRMED: 'amber',
  PROCESSING: 'amber',
  HANDED_TO_COURIER: 'neutral',
  IN_TRANSIT: 'neutral',
  DELIVERED: 'green',
  CANCELLED: 'neutral',
  RETURNED: 'neutral',
  FAILED: 'neutral',
};

/** A courier parcel with its tracking timeline (STF-9). */
export type Shipment = {
  provider: string;
  trackingCode: string | null;
  trackingUrl: string | null;
  courierStatus: string | null;
  bookedAt: string;
  events: { status: string; message: string | null; at: string }[];
};

/** Courier status text as shown to people ("in_transit" -> "In transit"). */
export const courierStatusText = (s: string) => {
  const t = s.replace(/_/g, ' ').trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : '';
};
