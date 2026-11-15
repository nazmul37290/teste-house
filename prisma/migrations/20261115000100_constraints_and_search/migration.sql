-- Rules Prisma cannot express (docs/database.md section 4). Hand-written; never edit after it is applied.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- stock, price, unit and quantity
ALTER TABLE product_variants ADD CONSTRAINT chk_variant_stock CHECK ("stockQty" >= 0);
ALTER TABLE product_variants ADD CONSTRAINT chk_variant_price CHECK (price >= 0 AND ("salePrice" IS NULL OR ("salePrice" >= 0 AND "salePrice" < price)));
ALTER TABLE product_variants ADD CONSTRAINT chk_variant_unit CHECK (("unit" IS NULL) = ("unitValue" IS NULL) AND ("unitValue" IS NULL OR "unitValue" > 0));
ALTER TABLE cart_items       ADD CONSTRAINT chk_cart_qty   CHECK (quantity > 0);
ALTER TABLE order_items      ADD CONSTRAINT chk_item_qty   CHECK (quantity > 0);

-- pricing integrity (see docs/pricing.md): the database refuses inconsistent money
ALTER TABLE order_items ADD CONSTRAINT chk_item_amounts CHECK (
  "unitPrice" >= 0 AND "listPrice" >= "unitPrice" AND "discountAmount" >= 0
  AND "lineTotal" = "unitPrice" * quantity AND "discountAmount" <= "lineTotal");
ALTER TABLE orders ADD CONSTRAINT chk_order_amounts CHECK (
  subtotal >= 0 AND "discountTotal" >= 0 AND "deliveryCharge" >= 0
  AND "discountTotal" <= subtotal
  AND "grandTotal" = subtotal - "discountTotal" + "deliveryCharge" AND "grandTotal" >= 0);
ALTER TABLE coupons ADD CONSTRAINT chk_coupon_value CHECK (
  value > 0 AND (type <> 'PERCENT' OR value <= 100));
ALTER TABLE payments ADD CONSTRAINT chk_payment_amount CHECK (amount > 0);
ALTER TABLE refunds  ADD CONSTRAINT chk_refund_amount  CHECK (amount > 0);
ALTER TABLE reviews          ADD CONSTRAINT chk_rating     CHECK (rating BETWEEN 1 AND 5);

-- one default address per customer, one primary image per product, one default zone
CREATE UNIQUE INDEX uq_default_address ON customer_addresses ("customerId") WHERE "isDefault";
CREATE UNIQUE INDEX uq_primary_image   ON product_images ("productId") WHERE "isPrimary";
CREATE UNIQUE INDEX uq_default_zone    ON delivery_zones ((true)) WHERE "isDefault";

-- search: trigram indexes (a tsvector column can be added later if full-text ranking is needed)
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE INDEX idx_products_slug_trgm ON products USING gin (slug gin_trgm_ops);
