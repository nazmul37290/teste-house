# Pricing and totals

The server is the only source of truth for money. The browser may display prices and totals, but it never decides them. This file is the contract for every price, discount, delivery charge and total in the system.

## 1. Principles

1. **The client sends intent, not amounts.** `POST /orders` accepts only: variant IDs and quantities (or the server-side cart), coupon code, address (or address ID), payment method code, idempotency key, and optionally `expectedGrandTotal` for comparison. Any field named `price`, `unitPrice`, `total`, `discount`, `deliveryCharge` or similar is rejected by a strict Zod schema (`.strict()`), and a test proves it.
2. **One function computes everything.** `calculateOrderTotals()` in `packages/shared/src/pricing.ts` is a pure function. The API calls it for the authoritative result. The web app may call the same function for live display, but the API result always wins.
3. **Integer money inside the calculation.** Convert to integer paisa (1 taka = 100 paisa) at the start, calculate with integers, convert back at the end. No floating point anywhere. Database columns are `Decimal(12,2)`; JSON carries money as strings (`"1680.00"`).
4. **Prices are read inside the order transaction** from the database, never from the cart row, a cache, the request, or the storefront page.
5. **Snapshots.** The order stores every amount that was charged. Later price edits never change old orders.
6. **Defense in depth.** The database has CHECK constraints that reject inconsistent totals (see `database.md` section 4).

## 2. Assumptions (change here first if the business decides otherwise)

- All prices are in BDT and **tax-inclusive** (VAT is included in the listed price). There is no separate tax line.
- Effective unit price of a variant = `salePrice` if set, otherwise `price`. Admin validation requires `0 <= salePrice < price`.
- One coupon per order. Coupons do not stack.
- Coupons apply to the merchandise subtotal, not to delivery.
- The free-delivery threshold is checked against the subtotal **after** the coupon discount (`subtotal - discount`).
- Rounding is half-up to whole paisa at each step defined below.
- Minimum order is 1 item; there is no minimum amount.

## 3. Calculation order

All amounts below are integer paisa.

1. **Line total.** For each item: `effectiveUnitPrice × quantity`. Quantity must be a positive integer and within stock.
2. **Subtotal.** Sum of line totals.
3. **Coupon discount** (if a coupon is supplied and valid):
   - `FIXED`: `value`.
   - `PERCENT`: `round_half_up(subtotal × value / 100)`.
   - Then cap by `maxDiscount` (if set), then cap by `subtotal` (a discount can never exceed the subtotal).
   - Reject (not silently ignore) if invalid: inactive, before `startsAt`, after `expiresAt`, subtotal below `minOrderAmount`, `usageLimit` reached, or `perCustomerLimit` reached for this customer or phone. The error is `422 BUSINESS_RULE` with a reason such as `COUPON_EXPIRED`.
4. **Net merchandise** = `subtotal - discount`.
5. **Delivery charge.** Resolve the zone from the address district: the zone that lists the district, otherwise the default zone. The resolved zone must be `isActive`; a turned-off zone means no delivery there and the order is rejected with `DELIVERY_NOT_AVAILABLE` (it does not fall back to the default zone). Charge = `0` if the zone has `freeDeliveryThreshold` and `net merchandise >= threshold`, else `zone.charge`.
6. **Grand total** = `net merchandise + deliveryCharge`. It is never negative.
7. **Payable amount.** COD: collect `grandTotal` on delivery. Online: the gateway charge equals `grandTotal` exactly.

### Discount allocation to lines

Refunds and partial returns need a per-line discount. Allocate the order discount to lines in proportion to line totals using the largest-remainder method so the allocated amounts sum **exactly** to the discount:

1. `share_i = discount × lineTotal_i / subtotal` (exact rational).
2. Take the floor of each share in paisa; distribute the leftover paisa one by one to the lines with the largest fractional remainders (ties: the earlier line).
3. Store the result in `order_items.discountAmount`.

A line's net amount is `lineTotal - discountAmount`. The refund for a returned line is its net amount (delivery charge is refunded only if the whole order is cancelled or the admin chooses to).

## 4. Worked example

| Item | List | Effective | Qty | Line total |
|---|---|---|---|---|
| Pure honey 500 g | 500.00 | 450.00 (sale) | 2 | 900.00 |
| Horlicks 1 kg | 780.00 | 780.00 | 1 | 780.00 |

- Subtotal: 1,680.00
- Coupon: 10% with `maxDiscount` 150.00 and `minOrderAmount` 1,500.00. 10% of 1,680.00 = 168.00, capped to **150.00**.
- Net merchandise: 1,530.00
- Zone: outside Dhaka, charge 130.00, free delivery from 2,000.00. 1,530.00 is below the threshold, so delivery is **130.00**.
- Grand total: **1,660.00**.
- Discount allocation (in paisa, 15,000 total): honey 15,000 × 90,000 / 168,000 = 8,035.71; Horlicks 6,964.29. Floors give 8,035 + 6,964 = 14,999; the leftover paisa goes to the larger remainder (honey): **80.36** and **69.64**, summing to 150.00.

This example is a required unit test.

## 5. Price changes between page view and order

- The customer sees prices from the storefront; the server recomputes at order time.
- If the client sends `expectedGrandTotal` and it differs from the server's result, respond `409 PRICE_CHANGED` with the new full breakdown and **do not create the order**. The UI shows the new total and the customer confirms again. `expectedGrandTotal` is never used to set a price.
- Stock or availability changes return `422 OUT_OF_STOCK` with the affected variants.

## 6. What is stored on the order

| Where | Fields |
|---|---|
| `order_items` | `listPrice` (regular price at order time), `unitPrice` (effective price charged), `quantity`, `lineTotal` (`unitPrice × quantity`), `discountAmount` (allocated coupon discount) |
| `orders` | `subtotal`, `discountTotal`, `deliveryCharge`, `grandTotal`, `couponId`, `couponCode`, `deliveryZoneId` |
| `payments` | `amount` (must equal `orders.grandTotal` for the initial charge) |
| `shipments` | `codAmount` = `grandTotal` for unpaid COD orders, else `0` |

Invariants (also database CHECKs):

- `lineTotal = unitPrice × quantity`
- `subtotal = Σ lineTotal`
- `discountTotal = Σ discountAmount` and `discountTotal <= subtotal`
- `grandTotal = subtotal - discountTotal + deliveryCharge` and `grandTotal >= 0`

## 7. Other money paths

- **Admin edits an order** (items, quantity, address, coupon removal): allowed before `HANDED_TO_COURIER`. The server re-runs `calculateOrderTotals()` with the stored coupon and the stored `unitPrice` values (existing items keep their order-time price; newly added items use the current price). Stock is adjusted with movements. Orders already paid online cannot change their total; use cancel and refund instead. Every edit is written to the audit log and order history.
- **Admin price changes** to variants affect only future orders. They require the `products.update` permission and write an audit log row with before and after.
- **Payment verification:** the UddoktaPay verified amount must equal `orders.grandTotal`. A mismatch marks the payment `FAILED` with a reason and flags the order for admin review; it never marks the order paid.
- **Webhooks and redirects never carry trusted amounts.** Amounts come from our database and from the gateway's verify call.
- **Refunds:** the sum of refunds for a payment cannot exceed the paid amount.
- **Coupon races:** increment `usedCount` with a conditional update (`WHERE usedCount < usageLimit`); check `perCustomerLimit` inside the transaction under `pg_advisory_xact_lock(hashtext(couponId || phone))`.
- **Courier COD amount:** use the integer or decimal format the Steadfast documentation requires. If it requires whole taka, enforce whole-taka prices in admin input instead of rounding at checkout.

## 8. Implementation notes

- Use integer paisa or `decimal.js` inside `pricing.ts`; never JavaScript `number` arithmetic on decimals. Convert Prisma `Decimal` to paisa with string parsing, not `toNumber()`.
- Signature (sketch):

```ts
type PricingInput = {
  items: { variantId: string; quantity: number; price: Paisa; salePrice: Paisa | null }[];
  coupon: { type: 'FIXED' | 'PERCENT'; value: Paisa | number; minOrderAmount?: Paisa; maxDiscount?: Paisa } | null;
  zone: { charge: Paisa; freeDeliveryThreshold?: Paisa };
};

type PricingResult = {
  lines: { variantId: string; listPrice: Paisa; unitPrice: Paisa; quantity: number; lineTotal: Paisa; discountAmount: Paisa }[];
  subtotal: Paisa;
  discountTotal: Paisa;
  deliveryCharge: Paisa;
  grandTotal: Paisa;
};
```

- Coupon validity (dates, limits, active flag) and zone resolution happen in the service before calling the pure function; the pure function only does arithmetic, so it is trivially testable.
- The API returns the full `PricingResult` in the order response and in the checkout quote endpoint.

## 9. Required tests

Unit tests for `calculateOrderTotals()`:

- Worked example in section 4.
- No coupon; coupon `FIXED`; coupon `PERCENT`; percent capped by `maxDiscount`; fixed larger than subtotal (capped); percent that needs rounding (for example 7% of 333.33).
- Sale price used; sale price null; sale price equal to price rejected earlier by validation.
- Free delivery exactly at the threshold, one paisa below, and one paisa above; threshold reached only before discount but not after.
- Discount allocation sums exactly to the discount for 1, 2, 3, 7 lines, including awkward remainders and a zero discount.
- Quantity 1 and large quantities; zero or negative quantity rejected.
- Property test: for random carts, invariants in section 6 always hold and `grandTotal >= 0`.

API tests:

- Strict schema rejects any client-supplied price, total, discount or delivery field.
- Tampered `expectedGrandTotal` returns `409 PRICE_CHANGED` and creates no order.
- Price changed after cart add: order uses the new database price.
- Inactive variant, archived product, out of stock, inactive delivery zone, COD not allowed for district: all rejected.
- Two concurrent orders for the last unit: exactly one succeeds.
- Coupon with `usageLimit` 1 used by two concurrent orders: exactly one succeeds.
- Duplicate `Idempotency-Key` returns the same order and does not double-decrement stock.
- Gateway verify amount different from `grandTotal` never marks the order paid.
- Database CHECKs reject an inconsistent total inserted directly.
