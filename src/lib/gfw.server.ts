import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env.server";
import { SLICKS, VESSELS } from "@/lib/oil-data";

const FILE = path.join(process.cwd(), ".data", "gfw-token");
const GFW = "https://gateway.api.globalfishingwatch.org/v3";

type Slot = { token?: string };
const g = globalThis as typeof globalThis & { __gfwToken?: Slot };
if (!g.__gfwToken) g.__gfwToken = {};
const mem: Slot = g.__gfwToken;

export type GfwGap = { from: string; to: string; hours: number };
export type GfwHint = {
  mmsi: string;
  name?: string;
  flag?: string;
  gfwId?: string;
  gaps: GfwGap[];
};

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

export async function gfwToken(fromCookie?: string): Promise<string | undefined> {
  return (await readSaved()) || env("GFW_API_ACCESS_TOKEN") || fromCookie;
}

export async function gfwStatus(fromCookie?: string) {
  const saved = await readSaved();
  const fromEnv = env("GFW_API_ACCESS_TOKEN");
  const token = saved || fromEnv || fromCookie;
  if (fromCookie && !mem.token) mem.token = fromCookie;
  return {
    connected: Boolean(token),
    source: saved ? ("saved" as const) : fromEnv ? ("env" as const) : fromCookie ? ("saved" as const) : ("none" as const),
    last4: token ? last4(token) : null,
  };
}

export async function saveGfwToken(raw: string) {
  const token = raw.trim();
  if (token.length < 24 || token.length > 4000) {
    return { ok: false as const, error: "Token looks too short or too long." };
  }
  const probe = await gfwFetch(token, "/vessels/search?query=636019881&limit=1");
  if (probe.status === 401 || probe.status === 403) {
    return { ok: false as const, error: "GFW rejected that token (401/403)." };
  }
  if (probe.status === 429) {
    return { ok: false as const, error: "GFW rate limit — try again in a minute." };
  }
  if (!probe.ok && probe.status !== 404) {
    return { ok: false as const, error: `GFW probe failed (${probe.status}).` };
  }
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    await writeFile(FILE, token, { mode: 0o600 });
  } catch {
    /* published host has no durable disk */
  }
  mem.token = token;
  return { ok: true as const, last4: last4(token) };
}

export async function clearGfwToken() {
  mem.token = undefined;
  try {
    await unlink(FILE);
  } catch {
    /* already gone */
  }
}

async function gfwFetch(token: string, pathAndQuery: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${GFW}${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

function hoursOf(from: string, to: string) {
  return Math.max(0, (Date.parse(to) - Date.parse(from)) / 36e5);
}

function pickVessel(json: unknown, mmsi: string): { name?: string; flag?: string; gfwId?: string } {
  const root = json as {
    entries?: {
      dataset?: string;
      registryInfo?: { id?: string; shipName?: string; flag?: string }[];
      selfReportedInfo?: { id?: string; ssvid?: string; shipname?: string; flag?: string }[];
    }[];
    data?: unknown[];
  };
  const entries = root.entries ?? [];
  for (const e of entries) {
    const self = (e.selfReportedInfo ?? []).find((s) => s.ssvid === mmsi) ?? e.selfReportedInfo?.[0];
    const reg = e.registryInfo?.[0];
    return {
      gfwId: self?.id ?? reg?.id,
      name: reg?.shipName ?? self?.shipname,
      flag: reg?.flag ?? self?.flag,
    };
  }
  return {};
}

function parseGaps(json: unknown): GfwGap[] {
  const root = json as {
    entries?: { start?: string; end?: string; startDate?: string; endDate?: string }[];
  };
  const out: GfwGap[] = [];
  for (const e of root.entries ?? []) {
    const from = e.start ?? e.startDate;
    const to = e.end ?? e.endDate;
    if (!from || !to) continue;
    out.push({ from, to, hours: Number(hoursOf(from, to).toFixed(1)) });
  }
  return out;
}

const cache = new Map<string, { at: number; hints: GfwHint[] }>();

export async function enrichSlick(slickId: string, fromCookie?: string): Promise<{ hints: GfwHint[]; live: boolean; error?: string }> {
  const token = await gfwToken(fromCookie);
  if (!token) return { hints: [], live: false };
  const hit = cache.get(slickId);
  if (hit && Date.now() - hit.at < 5 * 60 * 1000) return { hints: hit.hints, live: true };

  const slick = SLICKS.find((s) => s.id === slickId);
  if (!slick) return { hints: [], live: true, error: "Unknown slick" };

  const start = new Date(Date.parse(slick.when) - 72 * 3600 * 1000).toISOString().slice(0, 10);
  const end = new Date(Date.parse(slick.when) + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const hints: GfwHint[] = [];

  for (const v of VESSELS.slice(0, 8)) {
    try {
      const search = await gfwFetch(token, `/vessels/search?query=${encodeURIComponent(v.mmsi)}&limit=1`);
      if (search.status === 401 || search.status === 403) {
        return { hints: [], live: false, error: "Token unauthorized" };
      }
      if (!search.ok) continue;
      const ident = pickVessel(await search.json(), v.mmsi);
      const hint: GfwHint = { mmsi: v.mmsi, ...ident, gaps: [] };
      if (ident.gfwId) {
        const q = new URLSearchParams();
        q.append("datasets[0]", "public-global-gaps-events:latest");
        q.append("vessels[0]", ident.gfwId);
        q.set("start-date", start);
        q.set("end-date", end);
        q.set("limit", "10");
        q.set("offset", "0");
        const ev = await gfwFetch(token, `/events?${q.toString()}`);
        if (ev.ok) hint.gaps = parseGaps(await ev.json());
      }
      hints.push(hint);
    } catch {
      /* skip this MMSI; keep demo scoring */
    }
  }

  cache.set(slickId, { at: Date.now(), hints });
  return { hints, live: true };
}
