-- Associate each VIN lookup with the user who ran it; allow multiple rows per query (history).
ALTER TABLE vin_lookups ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

UPDATE vin_lookups SET user_id = (SELECT id FROM users ORDER BY id LIMIT 1) WHERE user_id IS NULL;

DO $$ BEGIN
  ALTER TABLE vin_lookups ALTER COLUMN user_id SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

DROP INDEX IF EXISTS idx_vin_lookups_query;

ALTER TABLE vin_lookups DROP CONSTRAINT IF EXISTS vin_lookups_query_vin_query_cart_name_query_sku_query_key;

CREATE INDEX IF NOT EXISTS idx_vin_lookups_user_created ON vin_lookups (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vin_lookups_user_query ON vin_lookups (user_id, query_vin, query_cart_name, query_sku_query, created_at DESC);
