CREATE TABLE IF NOT EXISTS vin_lookups (
  id SERIAL PRIMARY KEY,
  query_vin VARCHAR(100) NOT NULL,
  query_cart_name VARCHAR(255) NOT NULL DEFAULT 'default-cart',
  query_sku_query VARCHAR(500) NOT NULL DEFAULT '',
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (query_vin, query_cart_name, query_sku_query)
);

CREATE INDEX IF NOT EXISTS idx_vin_lookups_query ON vin_lookups (query_vin, query_cart_name, query_sku_query);