# OILGUARD AI (oilspill-detective)

Satellite oil-slick detections fused with AIS tracks to rank likely sources.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default port 8080).

## Live data

- **Sentinel-1 radar** — Microsoft Planetary Computer (no key)
- **AISStream** — paste a free key in **Settings**, or set `AISSTREAM_API_KEY` in `.env`
- **Global Fishing Watch** — optional token in Settings, or `GFW_API_ACCESS_TOKEN`

Copy `.env.example` to `.env`. Do not commit keys. Nothing under `.data/` is committed.

Triage scores are not legal proof.

## Stack

React 19, TanStack Start, Leaflet, Tailwind v4.
