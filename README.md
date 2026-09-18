# OILGUARD AI

Satellite oil-slick detections fused with AIS tracks to rank likely sources.

- Live: [oilguard-ai.grok.me](https://oilguard-ai.grok.me)
- Repo: [crabsoupT0T/oilspill-detective](https://github.com/crabsoupT0T/oilspill-detective)

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default port 8080).

## Live data

- **Sentinel-1 radar** — Microsoft Planetary Computer (no key)
- **AISStream** — paste a free key in **Settings**. Do not commit keys. Optional env: `AISSTREAM_API_KEY`
- **Global Fishing Watch** — paste a GFW token in Settings. Optional env: `GFW_API_ACCESS_TOKEN`

Triage scores are not legal proof.

## Stack

React 19, TanStack Start, Leaflet, Tailwind v4.

API keys stay in Settings / env. Nothing under `.data/` is committed.
