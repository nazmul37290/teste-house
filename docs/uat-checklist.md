# Acceptance test (UAT) checklist

For the shop owner, on **staging**, before going live. Work through it on a phone (the shop is used mostly on phones) and on a computer for the admin. Tick each line; write down anything that looks wrong, with a screenshot. Use test data only: the UddoktaPay sandbox, made-up customers. Courier steps need Steadfast connected; until then, move orders by hand with the status buttons.

## A. Setup (admin)

- [ ] Sign in to `/admin` as Super Admin; turn on two-factor authentication under My security.
- [ ] Settings: store name, phone, email, address, admin email for alerts. The name appears in the shop header and in emails.
- [ ] Delivery zones: real charges for Inside Dhaka and Outside Dhaka, free-delivery threshold if wanted.
- [ ] Payment methods: Cash on Delivery scope (Dhaka only or all Bangladesh); Online Payment on.
- [ ] Create a staff role (for example Salesman) and a staff account; sign in as them and check they only see what they should.
- [ ] Add one real product with two sizes and photos; check it on the shop.

## B. Shopping as a guest

- [ ] Find a product by search and through a category; filters and sorting work.
- [ ] Add two products to the cart, change a quantity, remove one.
- [ ] Save a product to the wishlist (heart); it is there after reloading.
- [ ] Checkout inside Dhaka with Cash on Delivery: the delivery charge matches the zone; the order confirmation page shows the right total.
- [ ] Order email arrives (if an email was given); the admin alert email arrives.
- [ ] Track the order at `/track` with the order number and phone.

## C. Online payment

- [ ] Checkout with Online Payment; pay in the sandbox (bKash, any transaction id, Completed).
- [ ] Back in the shop the order shows as paid and confirmed; confirmation email arrives.
- [ ] Start another online order and close the payment page without paying: after 30 minutes the order is cancelled automatically and the stock is back.

## D. Customer account

- [ ] Register with a phone number (and email); verify the email from the message.
- [ ] Guest orders placed earlier with that email now appear under Orders.
- [ ] Save an address; check out with it.
- [ ] Cancel an order that is still pending; stock and coupon use are returned.
- [ ] Download an invoice PDF.

## E. Admin order work

- [ ] Orders list: find an order by number and by phone.
- [ ] Confirm → Being packed → Send to courier (or "With the courier" by hand) → On the way → Delivered. Customer gets the shipped and delivered emails.
- [ ] Edit an order before it ships (change a quantity, change the address): totals and stock update.
- [ ] Add an internal note; print the invoice and packing slip.
- [ ] Record a refund on a paid online order (partial, then the rest).
- [ ] Return a delivered order: stock comes back.

## F. Coupons, reviews, marketing

- [ ] Create a coupon (10% off, minimum order); it applies at checkout and refuses below the minimum.
- [ ] After an order is Delivered, the customer writes a review with a photo; approve it in Reviews; it shows on the product with stars; reply to it.
- [ ] Change a banner and a home page section; the home page updates within seconds.
- [ ] Change a product price; the product page shows the new price within seconds.

## G. Final checks

- [ ] Cookie banner appears (when the GTM id is set); choices are remembered.
- [ ] Legal pages (privacy, terms, returns) have the real text.
- [ ] Every email shows the right store name and logo.
- [ ] Phone layout: no sideways scrolling on the home, product, cart and checkout pages.

Sign-off: name, date, and "approved for launch" or the list of things to fix.
