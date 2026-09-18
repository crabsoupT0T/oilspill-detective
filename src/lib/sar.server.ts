import type { RegionId } from "@/lib/oil-data";

/** minLon, minLat, maxLon, maxLat */
const BBOX: Record<RegionId, [number, number, number, number]> = {
  hormuz: [52.1, 24.4, 58.4, 27.05],
  med: [30.3, 31.9, 35.3, 35.05],
  malacca: [100.3, 1.05, 105.3, 3.7],
  gom: [-93.8, 26.4, -86.1, 28.5],
  black: [28.45, 41.85, 34.3, 43.85],
};

export type SarScene = {
  item: string;
  when: string;
  region: RegionId;
  /** south, west, north, east */
  bounds: [number, number, number, number];
};

type Cache = { at: number; scene: SarScene };
const g = globalThis as typeof globalThis & { __sarLatest?: Map<RegionId, Cache> };
g.__sarLatest ??= new Map();

export async function latestSar(region: RegionId): Promise<SarScene | null> {
  const hit = g.__sarLatest?.get(region);
  const [west, south, east, north] = BBOX[region];
  const cy = (south + north) / 2;
  const cx = (west + east) / 2;
  if (hit && Date.now() - hit.at < 30 * 60 * 1000 && hit.scene.bounds) {
    const [s, w, n, e] = hit.scene.bounds;
    if (cx >= w && cx <= e && cy >= s && cy <= n) return hit.scene;
  }

  const end = new Date();
  const start = new Date(end.getTime() - 60 * 24 * 3600 * 1000);
  const body = JSON.stringify({
    collections: ["sentinel-1-rtc"],
    bbox: BBOX[region],
    limit: 10,
    datetime: `${start.toISOString()}/${end.toISOString()}`,
  });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch("https://planetarycomputer.microsoft.com/api/stac/v1/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: ctrl.signal,
    });
    if (!res.ok) return hit?.scene ?? null;
    const json = (await res.json()) as {
      features?: {
        id?: string;
        bbox?: number[];
        properties?: { datetime?: string };
      }[];
    };
    const feats = json.features ?? [];
    const scored = feats
      .filter((x) => x.id)
      .map((x) => {
        const bb = x.bbox && x.bbox.length >= 4 ? x.bbox : [west, south, east, north];
        const covers = cx >= bb[0] && cx <= bb[2] && cy >= bb[1] && cy <= bb[3];
        const overlap =
          Math.max(0, Math.min(east, bb[2]) - Math.max(west, bb[0])) *
          Math.max(0, Math.min(north, bb[3]) - Math.max(south, bb[1]));
        return { x, covers, overlap };
      })
      .sort((a, b) => Number(b.covers) - Number(a.covers) || b.overlap - a.overlap);
    const f = scored[0]?.x;
    if (!f?.id) return hit?.scene ?? null;
    const bb = f.bbox;
    const bounds: [number, number, number, number] = bb && bb.length >= 4
      ? [bb[1], bb[0], bb[3], bb[2]]
      : [BBOX[region][1], BBOX[region][0], BBOX[region][3], BBOX[region][2]];
    const scene: SarScene = {
      item: f.id,
      when: f.properties?.datetime ?? end.toISOString(),
      region,
      bounds,
    };
    g.__sarLatest?.set(region, { at: Date.now(), scene });
    return scene;
  } catch {
    return hit?.scene ?? null;
  } finally {
    clearTimeout(t);
  }
}
