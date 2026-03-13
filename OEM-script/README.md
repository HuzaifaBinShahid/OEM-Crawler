# OEM VIN Lookup Scraper

Modular Crawlee + Playwright automation for the RepairLink/OnCommand portal: login, VIN search, and build sheet extraction.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Environment**

   Copy `.env.example` to `.env` and set your RepairLink credentials:

   ```
   REPAIRLINK_USER=your_username
   REPAIRLINK_PASSWORD=your_password
   REPAIRLINK_LOGIN_URL=https://repairlinkshop.com/Account/Login
   ```

## Usage

Run a VIN lookup (uses `.env` for credentials):

```bash
npm run vin -- --vin=7C444350 --cart-name=test1
```

**Part search (sku-query):** After the Detail List loads, you can pass a part name to find it in the left tree and scrape the right-hand parts table:

```bash
npm run vin -- --vin=7C444350 --cart-name=test1 --sku-query="steering gear"
```

The scraper finds the matching node in the Illustrations List (e.g. "Steering Gear" or "POWER STEERING GEAR | SHEPPARD M100, ROSS TAS65"), expands the parent if needed, clicks it, then scrapes `#partsTable` (Part Number, Description, Service Part Number, etc.) into the JSON result.

## Project structure

- `src/config.ts` – URLs, timeouts, env (no selectors)
- `src/selectors.ts` – All portal/OnCommand selectors
- `src/steps/` – Step modules: login, modal, navigation, vin-form, detail-list, extract, part-search
- `src/runner.ts` – Orchestrates the flow (Playwright + storageState for session persistence)
- `src/main.ts` – CLI entry (parses `--vin`, `--cart-name`, `--sku-query`)

## Session persistence

The runner uses Playwright’s **storageState** (cookies + local storage) so you don’t have to log in every time:

- **First run:** Logs in, then saves the session to `storage/repairlink-state.json`.
- **Later runs:** If `storage/repairlink-state.json` exists, the browser context is created with that state; the site sees you as already logged in and the login step is skipped.

To force a fresh login, delete the state file: `storage/repairlink-state.json`. The `storage/` folder is gitignored. You can set `REPAIRLINK_SESSION_STORAGE` to use a different storage directory (default is `storage`).

## Flow

1. If not logged in: login at RepairLink; otherwise skip login.
2. Close post-login modal (“Add Your First Payment Method!”) if it appears.
3. Click “International / IC Bus” then “Begin Part Search Here”
4. Fill Cart Name + VIN, click “Open Catalog”
5. On OnCommand page, click “Detail List” tab
6. Extract Vehicle Build Summary and Vehicle Build List (with pagination)
7. If `--sku-query` is set: find the matching item in the left Illustrations List tree (e.g. "steering gear"), expand parent if collapsed, click the node, then scrape the right-hand `#partsTable` (Part Number, Description, Service Part Number, Required Quantity) and return those parts in the JSON.

Output is JSON suitable for later PostgreSQL storage and SKU search.
