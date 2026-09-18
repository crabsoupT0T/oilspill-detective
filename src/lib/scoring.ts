import { AIS_GAPS, PLATFORMS, TRACKS, VESSELS, type Slick, type Vessel } from "./oil-data";

export type Role = "source" | "transit" | "near";

export type Suspect = {
  mmsi: string;
  vessel: Vessel;
  distKm: number;
  dtHours: number;
  signedHours: number;
  align: number;
  score: number;
  reasons: string[];
  role: Role;
  platform?: boolean;
  gfwLive?: boolean;
};

export type GfwHint = {
  mmsi: string;
  name?: string;
  flag?: string;
  gaps: { from: string; to: string; hours: number }[];
};

function haversine(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function heading(p0: [number, number], p1: [number, number]) {
  const y = Math.sin(((p1[1] - p0[1]) * Math.PI) / 180) * Math.cos((p1[0] * Math.PI) / 180);
  const x =
    Math.cos((p0[0] * Math.PI) / 180) * Math.sin((p1[0] * Math.PI) / 180) -
    Math.sin((p0[0] * Math.PI) / 180) *
      Math.cos((p1[0] * Math.PI) / 180) *
      Math.cos(((p1[1] - p0[1]) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angDiff(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function slickAxis(s: Slick) {
  const p = s.poly;
  return heading(p[0], p[Math.floor(p.length / 2)]);
}

function hoursBetween(isoA: string, isoB: string) {
  return (new Date(isoA).getTime() - new Date(isoB).getTime()) / 36e5;
}

/** Source dumped at origin. Transit only later steamed through spreading oil. */
export function roleFromContact(missKm: number, onSlick: boolean, signedHours: number): Role {
  const hit = onSlick || missKm <= 18;
  if (!hit) return "near";
  if (signedHours > 2) return "transit";
  if (signedHours < -8) return "near";
  return "source";
}

export function roleLabel(role: Role) {
  if (role === "source") return "Likely source — at origin when oil appeared";
  if (role === "transit") return "Later transit — steamed through oil that had already spread";
  return "Near miss — did not intersect the sheen";
}

function scoreVessel(mmsi: string, slick: Slick, hint?: GfwHint): Suspect | null {
  const track = TRACKS[mmsi];
  const v = VESSELS.find((x) => x.mmsi === mmsi);
  if (!track || !v) return null;
  let bestDist = Infinity;
  let bestPt = track[0];
  let bestI = 0;
  track.forEach((pt, i) => {
    const d = haversine([pt[0], pt[1]], [slick.lat, slick.lon]);
    if (d < bestDist) {
      bestDist = d;
      bestPt = pt;
      bestI = i;
    }
  });
  const signedHours = hoursBetween(bestPt[2], slick.when);
  const dt = Math.abs(signedHours);
  if (bestDist > 80 || dt > 36) return null;
  const i1 = Math.max(0, bestI - 1);
  const i2 = Math.min(track.length - 1, bestI + 1);
  const shipH = heading([track[i1][0], track[i1][1]], [track[i2][0], track[i2][1]]);
  const axis = slickAxis(slick);
  const align = 1 - Math.min(angDiff(shipH, axis), angDiff(shipH, (axis + 180) % 360)) / 90;
  const prox = Math.max(0, 1 - bestDist / 40);
  const temp = Math.max(0, 1 - dt / 6);
  const typeBoost = v.type === "tanker" || v.type === "bunker" ? 0.12 : 0;
  const corpusGap = AIS_GAPS.find((g) => g.mmsi === mmsi);
  const liveGap = hint?.gaps.find((g) => Math.abs(hoursBetween(g.from, slick.when)) < 8);
  const gap = liveGap ?? corpusGap;
  const darkBoost = gap && Math.abs(hoursBetween(gap.from, slick.when)) < 6 ? 0.15 : 0;
  const role = roleFromContact(bestDist, bestDist < 8, signedHours);
  let raw = 0.38 * prox + 0.28 * temp + 0.22 * align + typeBoost + darkBoost;
  if (role === "transit") raw = 0.12 * prox;
  if (role === "near") raw *= 0.45;
  const score = Math.min(0.99, raw * (0.85 + 0.15 * slick.confidence));
  const vessel = {
    ...v,
    name: hint?.name?.trim() || v.name,
    flag: hint?.flag?.trim() || v.flag,
  };
  return {
    mmsi,
    vessel,
    distKm: bestDist,
    dtHours: dt,
    signedHours,
    align,
    score,
    role,
    gfwLive: Boolean(hint && (hint.name || hint.gaps.length)),
    reasons: [
      roleLabel(role),
      `${bestDist.toFixed(1)} km from slick origin`,
      signedHours >= 0
        ? `${signedHours.toFixed(1)} h after SAR scene`
        : `${Math.abs(signedHours).toFixed(1)} h before SAR scene`,
      gap
        ? `${liveGap ? "GFW AIS-off" : "AIS gap"} ${gap.hours} h near scene`
        : hint
          ? "GFW: continuous AIS in window"
          : "continuous AIS",
    ],
  };
}

export function suspectsFor(slick: Slick, hints: GfwHint[] = []): Suspect[] {
  const byMmsi = new Map(hints.map((h) => [h.mmsi, h]));
  const out: Suspect[] = [];
  for (const v of VESSELS) {
    const s = scoreVessel(v.mmsi, slick, byMmsi.get(v.mmsi));
    if (s) out.push(s);
  }
  if (slick.class === "platform-seep" || slick.region === "gom" || slick.region === "hormuz") {
    for (const p of PLATFORMS.filter((x) => x.region === slick.region)) {
      const d = haversine([p.lat, p.lon], [slick.lat, slick.lon]);
      if (d < 25) {
        out.push({
          mmsi: p.id,
          vessel: {
            mmsi: p.id,
            imo: "—",
            name: p.name,
            flag: "—",
            type: "platform",
            class: "Offshore infrastructure",
          },
          distKm: d,
          dtHours: 0,
          signedHours: 0,
          align: 1,
          score: Math.min(0.95, 0.7 * (1 - d / 25) + 0.2 * slick.confidence),
          role: "source",
          reasons: [`${d.toFixed(1)} km from known infrastructure`, "stationary source geometry"],
          platform: true,
        });
      }
    }
  }
  return out.sort((a, b) => {
    const rank = { source: 0, near: 1, transit: 2 };
    return rank[a.role] - rank[b.role] || b.score - a.score;
  });
}

export function driftEnd(slick: Slick, forecast: boolean): [number, number] {
  const axis = (slickAxis(slick) * Math.PI) / 180;
  const km = forecast ? 28 : 14;
  const dLat = (km / 111) * Math.cos(axis);
  const dLon = (km / (111 * Math.cos((slick.lat * Math.PI) / 180))) * Math.sin(axis);
  return [slick.lat + dLat, slick.lon + dLon];
}

export function haversineKm(a: [number, number], b: [number, number]) {
  return haversine(a, b);
}
