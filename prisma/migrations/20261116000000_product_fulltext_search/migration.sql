-- Full-text search on product name and short description (docs/database.md, search). The expression
-- must match the one in the storefront query exactly, or Postgres cannot use the index. The trigram
-- indexes on name and slug (idx_products_name_trgm, idx_products_slug_trgm) already exist.
CREATE INDEX idx_products_fts ON products
  USING gin (to_tsvector('simple', name || ' ' || coalesce("shortDescription", '')));
