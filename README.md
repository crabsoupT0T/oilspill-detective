# OILGUARD AI (oilspill-detective)

Satellite oil-slick detections fused with AIS tracks to rank likely sources.

Live demo: [oilguard-ai.grok.me](https://oilguard-ai.grok.me)

## Run locally

```bash
npm install
cp .env.example .env   # optional keys
npm run dev
```

Open http://localhost:8080

## Live data

| Source | Key |
|---|---|
| Sentinel-1 radar | none (Planetary Computer) |
| AISStream coastal ships | paste in **Settings**, or `AISSTREAM_API_KEY` |
| Global Fishing Watch | optional, `GFW_API_ACCESS_TOKEN` |

Do not commit `.env` or anything in `.data/`.

Scores are triage, not legal proof.

## Stack

React 19, TanStack Start, Leaflet, Tailwind v4.
