# Testing the VIN Lookup API (DB + Scraper)

Follow these steps to verify the endpoint fetches from MongoDB when data exists, and runs the scraper when it does not.

---

## Step 1: Start MongoDB

- If you installed MongoDB as a service, it may already be running.
- With **MongoDB Compass**: open Compass and connect to `mongodb://localhost:27017`. If it connects, MongoDB is running.
- If not, start MongoDB (e.g. run `mongod` or start the MongoDB service on your machine).

---

## Step 2: Create `.env` in the project root

Copy `.env.example` to `.env` and set at least:

- **RepairLink** (required for the scraper when cache misses):
  - `REPAIRLINK_USER=your_real_username`
  - `REPAIRLINK_PASSWORD=your_real_password`
- **MongoDB** (default is fine if MongoDB is local):
  - `MONGODB_URI=mongodb://localhost:27017/oem-vin`
- **API port** (optional):
  - `API_PORT=3000`

---

## Step 3: Install dependencies and start the API server

In the project folder:

```bash
npm install
npm run server
```

You should see:

- `API listening on http://localhost:3000`
- No MongoDB connection errors.

Leave this terminal open.

---

## Step 4: Check that the API is up

In a **new** terminal or in the browser:

- **Browser:** open `http://localhost:3000/health`  
  You should see: `{"ok":true}`

- **PowerShell:**
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/health"
  ```

---

## Step 5: First request (not in DB) – scraper runs

Use a **real VIN** that RepairLink accepts (the scraper will run and a browser window may open).

**Browser (GET):**

```
http://localhost:3000/api/vin-lookup?vin=YOUR_VIN&cartName=default-cart
```

Replace `YOUR_VIN` with your actual VIN (e.g. 17 characters).

**PowerShell (GET):**

```powershell
$vin = "YOUR_VIN"   # replace with real VIN
Invoke-RestMethod -Uri "http://localhost:3000/api/vin-lookup?vin=$vin&cartName=default-cart"
```

**PowerShell (POST with JSON body):**

```powershell
$body = @{ vin = "YOUR_VIN"; cartName = "default-cart" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/api/vin-lookup" -Method Post -Body $body -ContentType "application/json"
```

What to expect:

- First time: the API **does not** find the VIN in the DB, so it runs the **scraper** (browser may open), then saves the result to MongoDB and returns JSON.
- Response should include `"cached": false` and full data (`vin`, `parts`, `buildSheet`, etc.).

---

## Step 6: Second request (same VIN) – served from DB

Call the **same** URL again with the **same** VIN (and cartName).

**Browser:** open the same link again, or refresh.

**PowerShell:** run the same `Invoke-RestMethod` command again.

What to expect:

- Response returns **much faster** (no browser, no scraper).
- Response includes **`"cached": true`**.
- Data should match the first response (same parts, buildSheet, etc.).

This confirms the endpoint is **fetching from the database** when the lookup is already stored.

---

## Step 7: Verify in MongoDB Compass

1. Open **MongoDB Compass** and connect to `mongodb://localhost:27017`.
2. Open the database **`oem-vin`**.
3. Open the collection **`vinlookups`** (Mongoose uses lowercase plural of the model name “VinLookup”).
4. You should see at least one document with:
   - `queryVin` – VIN you used
   - `queryCartName` – e.g. `"default-cart"`
   - `querySkuQuery` – empty string if you didn’t pass `skuQuery`
   - `result` – the full JSON that the API returns (vin, parts, buildSheet, etc.)
   - `createdAt` / `updatedAt` – timestamps

That confirms the scraper result is **saved in the database** and the API is reading from it on the second request.

---

## Quick summary

| Step | Action                    | What happens                          |
|------|---------------------------|--------------------------------------|
| 1    | Start MongoDB             | DB ready for the API                 |
| 2    | Create `.env`             | Config for API + scraper             |
| 3    | `npm run server`          | API runs on port 3000                |
| 4    | GET `/health`             | Check API is up                      |
| 5    | First GET/POST with VIN   | Not in DB → scraper runs → save → return (`cached: false`) |
| 6    | Second GET/POST same VIN  | In DB → return from DB (`cached: true`) |
| 7    | Open Compass → `oem-vin` → `vinlookups` | See stored lookup document   |

---

## Optional: Test with `skuQuery`

To test a part search (e.g. “steering”):

```
http://localhost:3000/api/vin-lookup?vin=YOUR_VIN&cartName=default-cart&skuQuery=steering
```

Cache is per combination of `vin` + `cartName` + `skuQuery`, so different `skuQuery` values will trigger the scraper again if that combination isn’t in the DB yet.
