import type { Slick, TrafficShip } from "./oil-data";
import { SEA_LANES } from "./oil-data";
import { roleFromContact } from "./scoring";

export const WINDOW_H = 72;
export const STEP_MS = 10 * 60 * 1000;
export const WINDOW_MS = WINDOW_H * 3600 * 1000;
const SPEED_KMH = 13;

export type AisFix = { t: number; lat: number; lon: number };

export function liveNow(slickWhen: string) {
  return Date.parse(slickWhen) + 8 * 3600 * 1000;
}

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function routeLengthKm(path: [number, number][]) {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += haversineKm(path[i - 1], path[i]);
  return n;
}

export function atKm(path: [number, number][], km: number): [number, number] {
  if (path.length < 2) return path[0] ?? [0, 0];
  let left = Math.max(0, km);
  for (let i = 1; i < path.length; i++) {
    const d = haversineKm(path[i - 1], path[i]);
    if (left <= d || i === path.length - 1) {
      const u = d ? Math.min(1, left / d) : 0;
      return [
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * u,
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * u,
      ];
    }
    left -= d;
  }
  return path[path.length - 1];
}

function pingpong(km: number, length: number): { km: number; dir: 1 | -1 } {
  if (length <= 0) return { km: 0, dir: 1 };
  const cycle = length * 2;
  let x = ((km % cycle) + cycle) % cycle;
  if (x <= length) return { km: x, dir: 1 };
  return { km: cycle - x, dir: -1 };
}

export function nearestLane(region: Slick["region"], pt: [number, number]) {
  const lanes = SEA_LANES[region];
  let best = lanes[0];
  let bestD = Infinity;
  for (const lane of lanes) {
    for (const p of lane) {
      const d = haversineKm(pt, p);
      if (d < bestD) {
        bestD = d;
        best = lane;
      }
    }
  }
  return best;
}

/** Drop fixes older than now − 72h as the quota fills. */
export function trimWindow(fixes: AisFix[], now: number): AisFix[] {
  const cut = now - WINDOW_MS;
  let i = 0;
  while (i < fixes.length && fixes[i].t < cut) i += 1;
  return i ? fixes.slice(i) : fixes;
}

export function densifyAlong(route: [number, number][], passTime: number, now: number, dir: 1 | -1 = 1): AisFix[] {
  if (route.length < 2) return [];
  const length = routeLengthKm(route);
  const passKm = length * 0.45;
  const stepKm = SPEED_KMH * (STEP_MS / 3.6e6);
  const n = Math.ceil(WINDOW_MS / STEP_MS) + 8;
  const out: AisFix[] = [];
  for (let i = -n; i <= 24; i++) {
    const t = passTime + i * STEP_MS;
    const walked = passKm + dir * i * stepKm;
    const { km } = pingpong(walked, length);
    const [lat, lon] = atKm(route, km);
    out.push({ t, lat, lon });
  }
  return trimWindow(out, now);
}

export function densify72h(seed: [number, number][], passTime: number, now: number): AisFix[] {
  return densifyAlong(seed, passTime, now, 1);
}

export function advanceAlong(fixes: AisFix[], now: number, route: [number, number][], dir: 1 | -1): AisFix[] {
  if (!fixes.length || route.length < 2) return fixes;
  const length = routeLengthKm(route);
  const stepKm = SPEED_KMH * (STEP_MS / 3.6e6);
  let next = fixes;
  let last = next[next.length - 1];
  let kmGuess = 0;
  let best = Infinity;
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    const d = haversineKm(route[i - 1], route[i]);
    const mid: [number, number] = [(route[i - 1][0] + route[i][0]) / 2, (route[i - 1][1] + route[i][1]) / 2];
    const dist = haversineKm([last.lat, last.lon], mid);
    if (dist < best) {
      best = dist;
      kmGuess = acc + d / 2;
    }
    acc += d;
  }
  while (last.t + STEP_MS <= now) {
    kmGuess += dir * stepKm;
    const { km, dir: d } = pingpong(kmGuess, length);
    dir = d;
    kmGuess = km;
    const [lat, lon] = atKm(route, km);
    next = [...next, { t: last.t + STEP_MS, lat, lon }];
    last = next[next.length - 1];
  }
  return trimWindow(next, now);
}

export function clipFixes(fixes: AisFix[], t: number) {
  const path: [number, number][] = [];
  if (!fixes.length) return { path, pos: null as [number, number] | null };
  let pos: [number, number] = [fixes[0].lat, fixes[0].lon];
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i];
    if (f.t > t) {
      if (i > 0) {
        const p = fixes[i - 1];
        const u = (t - p.t) / (f.t - p.t || 1);
        pos = [p.lat + (f.lat - p.lat) * u, p.lon + (f.lon - p.lon) * u];
        path.push(pos);
      }
      break;
    }
    pos = [f.lat, f.lon];
    path.push(pos);
  }
  return { path, pos };
}

export function timedFleet(ships: TrafficShip[], slick: Slick, now: number) {
  const pass = Date.parse(slick.when);
  return ships.map((ship) => {
    const skew = (ship.phase - 0.5) * 6 * 3600 * 1000;
    const fixes = densifyAlong(ship.path, pass + skew, now, ship.dir);
    const signedHours = skew / 36e5;
    const role = roleFromContact(ship.missKm, ship.onSlick, signedHours);
    return { ...ship, fixes, role };
  });
}
