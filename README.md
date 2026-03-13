# VIN Lookup

A full-stack tool that automates VIN (Vehicle Identification Number) lookups on the RepairLink/OnCommand portal. It scrapes OEM part information and vehicle build data, caches results in a PostgreSQL database, and serves them through a React web UI with real-time streaming.

---

## What It Does

1. User enters a **VIN** and an optional **part query** (e.g., "steering gear") in the web UI
2. The backend checks if the result is already cached in the database — if so, it returns instantly
3. If not cached, a headless browser (Playwright) logs into RepairLink, navigates to the OnCommand portal, enters the VIN, and scrapes the vehicle's **build sheet** and **parts table**
4. Live progress is streamed to the UI via **Server-Sent Events (SSE)**
5. If multiple matching parts are found, the UI pauses and asks the user to select one
6. The final result is saved to PostgreSQL and displayed in the UI

---

## Project Structure

```
VIN-Lookup/
├── OEM-script/        # Backend: scraper + REST/SSE API (Node.js, TypeScript, Playwright)
└── vin-lookup-ui/     # Frontend: React web UI (Vite)
```

---

## OEM-script (Backend)

**Tech:** Node.js, TypeScript, Playwright, Express, PostgreSQL, OpenAI

### Setup

```bash
cd OEM-script
npm install
cp .env.example .env   # fill in credentials
```

### Environment Variables (`.env`)

```env
REPAIRLINK_USER=your_username
REPAIRLINK_PASSWORD=your_password
REPAIRLINK_LOGIN_URL=https://repairlinkshop.com/Account/Login
REPAIRLINK_SESSION_STORAGE=storage
REPAIRLINK_LOGS_DIR=logs
POSTGRES_URL=postgresql://postgres:postgres@localhost:5432/oem_vin
API_PORT=3000
OPENAI_API_KEY=your_openai_key
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run server` | Start the API server (port 3000) |
| `npm run vin` | Run a lookup from the CLI |
| `npm run build` | Compile TypeScript |

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/vin-lookup` | Lookup by VIN (cached or fresh) |
| GET | `/api/vin-lookup/stream` | SSE stream with live status updates |
| POST | `/api/vin-lookup/stream/select` | Submit part selection during stream |
| POST | `/api/vin-lookup/stream/stop` | Cancel a running lookup job |
| POST | `/api/vin-lookup/save-manual` | Save a manually edited result |

### How It Works

- **Session persistence:** On first run, the scraper logs into RepairLink and saves browser cookies to `storage/repairlink-state.json`. Subsequent runs reuse this session. Delete the file to force a fresh login.
- **Caching:** Results are stored in PostgreSQL as JSONB. The same VIN + cart name + query combination is never scraped twice.
- **AI fallback:** If a part query is ambiguous, OpenAI is used to extract the best search term.

---

## vin-lookup-ui (Frontend)

**Tech:** React 19, Vite, JavaScript

### Setup

```bash
cd vin-lookup-ui
npm install
cp .env.example .env   # set API URL
```

### Environment Variables (`.env`)

```env
VITE_API_URL=http://localhost:3000
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (localhost:5173) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

---

## Running Locally

1. Start PostgreSQL and create the database
2. Start the backend: `cd OEM-script && npm run server`
3. Start the frontend: `cd vin-lookup-ui && npm run dev`
4. Open `http://localhost:5173` in your browser
