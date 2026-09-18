import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { WebSocket as AisWs } from "ws";
import { env } from "@/lib/env.server";
import { WINDOW_MS } from "@/lib/ais-buffer";
import type { AisStatus, LiveShip } from "@/lib/ais-live";
import type { RegionId } from "@/lib/oil-data";

const FILE = path.join(process.cwd(), ".data", "aisstream-token");
const WS_URL = "wss://stream.aisstream.io/v0/stream";

const BOXES: Record<RegionId, [[number, number], [number, number]]> = {
  hormuz: [
    [23.8, 51.5],
    [27.6, 59.0],
  ],
  med: [
    [31.9, 30.3],
    [35.05, 35.3],
  ],
  malacca: [
    [0.55, 102.6],
    [2.4, 105.2],
  ],
  gom: [
    [26.4, -93.8],
    [28.5, -86.1],
  ],
  black: [
    [41.85, 28.45],
    [43.85, 34.3],
  ],
};

type Slot = {
  token?: string;
  ws?: AisWs;
  ships: Map<string, LiveShip>;
  streaming: boolean;
  error?: string;
  frames: number;
};

const g = globalThis as typeof globalThis & { __aisStream?: Slot };
if (!g.__aisStream) g.__aisStream = { ships: new Map(), streaming: false, frames: 0 };
const mem = g.__aisStream;

function last4(token: string) {
  return token.slice(-4);
}

async function readSaved(): Promise<string | undefined> {
  if (mem.token) return mem.token;
  try {
    const t = (await readFile(FILE, "utf8")).trim();
    if (t) mem.token = t;
    return t || undefined;
  } catch {
    return undefined;
  }
}

export async function aisToken() {
  return (await readSaved()) || env("AISSTREAM_API_KEY");
}

function parseAisTime(s: unknown): number {
  if (typeof s !== "string" || !s.trim()) return Date.now();
  const iso = s
    .replace(" +0000 UTC", "Z")
    .replace(" UTC", "Z")
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1");
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : Date.now();
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function frameText(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data);
  return String(data);
}

function ingest(raw: unknown) {
  const msg = raw as {
    MessageType?: string;
    error?: string;
    MetaData?: Record<string, unknown>;
    Message?: Record<string, Record<string, unknown>>;
  };
  if (msg.error) {
    mem.error = String(msg.error);
    return;
  }
  const meta = msg.MetaData ?? {};
  const pos =
    msg.Message?.PositionReport ??
    msg.Message?.StandardClassBPositionReport ??
    msg.Message?.ExtendedClassBPositionReport ??
    {};
  const lat = num(pos.Latitude ?? meta.Latitude ?? meta.latitude);
  const lon = num(pos.Longitude ?? meta.Longitude ?? meta.longitude);
  if (lat == null || lon == null) return;
  const mmsi = String(meta.MMSI ?? meta.mmsi ?? pos.UserID ?? "");
  if (!mmsi || mmsi === "undefined") return;
  const stamp = parseAisTime(meta.time_utc);
  const prev = mem.ships.get(mmsi);
  const last = prev?.path[prev.path.length - 1];
  const path = prev ? [...prev.path] : [];
  if (!last || Math.abs(last.lat - lat) > 1e-4 || Math.abs(last.lon - lon) > 1e-4) {
    path.push({ lat, lon, t: stamp });
  } else {
    path[path.length - 1] = { lat, lon, t: stamp };
  }
  if (path.length > 400) path.splice(0, path.length - 400);
  const name = String(meta.ShipName ?? prev?.name ?? "UNKNOWN").trim() || "UNKNOWN";
  mem.ships.set(mmsi, {
    mmsi,
    name,
    lat,
    lon,
    sog: num(pos.Sog) ?? prev?.sog ?? 0,
    cog: num(pos.Cog) ?? prev?.cog ?? 0,
    t: stamp,
    path,
  });
}

function prune() {
  const cut = Date.now() - WINDOW_MS;
  for (const [k, s] of mem.ships) {
    if (s.t < cut) mem.ships.delete(k);
  }
  if (mem.ships.size > 500) {
    const oldest = [...mem.ships.values()].sort((a, b) => a.t - b.t);
    for (let i = 0; i < oldest.length - 500; i++) mem.ships.delete(oldest[i].mmsi);
  }
}

function stopStream() {
  try {
    mem.ws?.close();
  } catch {
    /* ignore */
  }
  mem.ws = undefined;
  mem.streaming = false;
}

function startStream(token: string) {
  stopStream();
  mem.error = undefined;
  const ws = new AisWs(WS_URL, { perMessageDeflate: true });
  mem.ws = ws;
  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        APIKey: token,
        BoundingBoxes: Object.values(BOXES),
        FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"],
      }),
    );
    mem.streaming = true;
  });
  ws.on("message", (data) => {
    mem.frames += 1;
    try {
      ingest(JSON.parse(frameText(data)));
    } catch {
      /* skip junk */
    }
  });
  ws.on("error", () => {
    mem.streaming = false;
    mem.error = "AISStream socket error";
  });
  ws.on("close", () => {
    mem.streaming = false;
    if (mem.token && mem.ws === ws) {
      setTimeout(() => {
        if (mem.token) startStream(mem.token);
      }, 4000);
    }
  });
}

function inBox(lat: number, lon: number, region: RegionId) {
  const [[a, b], [c, d]] = BOXES[region];
  const minLat = Math.min(a, c);
  const maxLat = Math.max(a, c);
  const minLon = Math.min(b, d);
  const maxLon = Math.max(b, d);
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

export async function aisStatus(fromCookie?: string): Promise<AisStatus> {
  const saved = await readSaved();
  const fromEnv = env("AISSTREAM_API_KEY");
  const token = saved || fromEnv || fromCookie;
  if (token && !mem.token) mem.token = token;
  if (token && !mem.streaming && !mem.ws) startStream(token);
  prune();
  return {
    connected: Boolean(token),
    streaming: mem.streaming,
    source: saved || fromCookie ? "saved" : fromEnv ? "env" : token ? "env" : "none",
    last4: token ? last4(token) : null,
    ships: mem.ships.size,
    error: mem.error,
  };
}

export async function saveAisToken(raw: string) {
  const token = raw.trim();
  if (token.length < 8 || token.length > 4000) {
    return { ok: false as const, error: "Key looks too short or too long." };
  }
  const probed = await probeAis(token);
  if (!probed.ok && /rejected/i.test(probed.error ?? "")) return probed;
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, token, { mode: 0o600 });
  } catch {
    /* Vercel has no durable disk — cookie + memory still hold the key */
  }
  mem.token = token;
  startStream(token);
  return { ok: true as const, last4: last4(token) };
}

export async function clearAisToken() {
  stopStream();
  mem.token = undefined;
  mem.ships.clear();
  mem.error = undefined;
  try {
    await unlink(FILE);
  } catch {
    /* gone */
  }
}

export function liveShips(region: RegionId | "all"): LiveShip[] {
  prune();
  const all = [...mem.ships.values()].sort((a, b) => b.t - a.t);
  if (region === "all") return all.slice(0, 80);
  return all.filter((s) => inBox(s.lat, s.lon, region)).slice(0, 80);
}

function probeAis(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const ws = new AisWs(WS_URL, { perMessageDeflate: true });
    let done = false;
    const finish = (result: { ok: true } | { ok: false; error: string }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: true }), 4000);
    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          APIKey: token,
          BoundingBoxes: [BOXES.hormuz],
          FilterMessageTypes: ["PositionReport"],
        }),
      );
      finish({ ok: true });
    });
    ws.on("message", (data) => {
      const text = frameText(data);
      if (/invalid|unauthor|unauthorized|forbidden|api.?key/i.test(text)) {
        finish({ ok: false, error: "AISStream rejected that key." });
        return;
      }
      finish({ ok: true });
    });
    ws.on("error", () => finish({ ok: false, error: "Could not reach AISStream." }));
    ws.on("close", () => {
      if (!done) finish({ ok: false, error: "AISStream closed the probe." });
    });
  });
}
