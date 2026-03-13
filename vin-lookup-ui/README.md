# Part Number Lookup UI

Minimal React (Vite) UI for the OEM VIN lookup script. Enter VIN, cart name, and optional query; results are served from the database when available, otherwise the script runs and the result is shown.

## Setup

1. **Start the OEM API** (from `OEM-script` folder):
   ```bash
   cd ../OEM-script
   npm run server
   ```
   API runs at `http://localhost:3000` by default.

2. **Configure this app** (optional):
   - Copy `.env.example` to `.env` and set `VITE_API_URL` if your API is on another host/port.

3. **Run the UI**:
   ```bash
   npm install
   npm run dev
   ```
   Open the URL shown (e.g. http://localhost:5173).

## Usage

- **VIN Number** (required): e.g. `1HGBH41JXMN109186`
- **Cart Name**: default `default-cart`
- **Query** (optional): e.g. `steering`, `brake` to search for specific parts

Click **Fetch Part Number**. If the lookup exists in the database you get an instant result with a “From cache” badge; otherwise the scraper runs and a loader + progress bar are shown until the result is ready.
