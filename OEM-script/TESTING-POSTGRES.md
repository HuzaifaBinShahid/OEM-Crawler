# PostgreSQL setup and testing

The app uses PostgreSQL instead of MongoDB for storing VIN lookup results.

## 1. Install PostgreSQL

- Install PostgreSQL (e.g. from https://www.postgresql.org/download/) or use Docker:
  ```bash
  docker run -d --name oem-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=oem_vin -p 5432:5432 postgres:16
  ```

## 2. Create database (if not using Docker above)

If you use a local PostgreSQL server, create a database:

```bash
createdb oem_vin
```

Or in `psql`:

```sql
CREATE DATABASE oem_vin;
```

## 3. Configure connection

In `.env` set:

```
POSTGRES_URL=postgresql://USER:PASSWORD@localhost:5432/oem_vin
```

Example (default user/password):

```
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/oem_vin
```

Replace `USER`, `PASSWORD`, host or port if your setup differs.

## 4. Apply schema

Run the table creation script once.

**Option A – Node script (recommended):**

```bash
npm install
npx tsx src/db/init-db.ts
```

**Option B – psql:**

```bash
psql "postgresql://postgres:postgres@localhost:5432/oem_vin" -f src/db/schema.sql
```

This creates the `vin_lookups` table and index.

## 5. Start the API

```bash
npm run server
```

You should see:

```
API listening on http://localhost:3000
```

## 6. Test the API and database

**Health check:**

```bash
curl http://localhost:3000/health
```

**First request (not in DB – runs scraper, then saves to PostgreSQL):**

```bash
curl "http://localhost:3000/api/vin-lookup?vin=YOUR_VIN&cartName=default-cart"
```

Or with a part query:

```bash
curl "http://localhost:3000/api/vin-lookup?vin=YOUR_VIN&cartName=default-cart&skuQuery=frame"
```

**Second request (same VIN/cart/skuQuery – served from DB):**

Call the same URL again. The response should be fast and include `"cached": true`.

**Check data in PostgreSQL:**

```bash
psql "postgresql://postgres:postgres@localhost:5432/oem_vin" -c "SELECT id, query_vin, query_cart_name, query_sku_query, created_at FROM vin_lookups;"
```

Or in a GUI (pgAdmin, DBeaver, etc.): connect to `oem_vin` and open the `vin_lookups` table.

## Schema (reference)

Table: `vin_lookups`

| Column            | Type         | Description                          |
|------------------|--------------|--------------------------------------|
| id               | SERIAL       | Primary key                          |
| query_vin        | VARCHAR(100) | VIN used in the lookup               |
| query_cart_name  | VARCHAR(255) | Cart name (default: default-cart)    |
| query_sku_query  | VARCHAR(500) | Part search query (optional)         |
| result           | JSONB        | Full API result (vin, parts, etc.)    |
| created_at       | TIMESTAMPTZ  | First insert time                    |
| updated_at       | TIMESTAMPTZ  | Last update time                     |

Unique key: `(query_vin, query_cart_name, query_sku_query)` so each combination is stored once and updated on repeat lookups.
