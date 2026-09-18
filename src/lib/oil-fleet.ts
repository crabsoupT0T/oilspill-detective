import { SEA_LANES, type Slick } from "./oil-data";

const NAMES = [
  "ALTAIR WAVE",
  "RED SANDS",
  "ORION TRADER",
  "BLUE MARLIN",
  "EASTERN VENTURE",
  "SILVER CURRENT",
  "PERSIAN GALE",
  "GOLDEN HORIZON",
  "NILE STAR",
  "CORAL PATH",
  "ARCTIC LUMEN",
  "SAFFRON TIDE",
  "WESTWIND",
  "LANTANA",
  "IRON MONSOON",
  "ZEPHYR BAY",
  "QATAR PEARL",
  "SOCOTRA",
  "DHOW RUNNER",
  "BASRA LIGHT",
  "MUSCAT CROWN",
  "KHOR FAKKAN",
  "FUJAIRAH BREEZE",
  "STRATOS",
  "AMBER SEAS",
  "TIGRIS SUN",
  "HORMUZ PASS",
  "SALALAH EXPRESS",
  "ADEN TRADER",
  "MAKRAN",
  "BANDAR ROSE",
  "SHATT AL ARAB",
  "SIR BANI YAS",
  "JASK WIND",
  "MINA AL AHMADI",
  "RAS TANURA",
  "KHARG ISLAND",
  "UMM QASR",
  "DUBAI STAR",
  "ABU DHABI SKY",
  "LAVAN",
  "SIRRI",
  "LAVENDER SEA",
  "NEPTUNE REACH",
  "POLARIS HAWK",
  "GEMINI",
  "CASTELLUM",
  "AURIGA",
  "LYRA",
  "VEGA CARRIER",
  "ANTARES",
];
const FLAGS = ["LR", "PA", "MH", "SG", "MT", "HK", "NO", "GR", "CY", "BS"];
const KLASS = ["Aframax", "VLCC", "Suezmax", "Container", "Bulk", "Product tanker", "LNG carrier", "Bunker barge"];

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  let x = seed || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

export type TrafficShip = {
  mmsi: string;
  name: string;
  flag: string;
  klass: string;
  path: [number, number][];
  phase: number;
  named: boolean;
  missKm: number;
  onSlick: boolean;
  dir: 1 | -1;
  role: "source" | "transit" | "near";
};

const PASS_KM = 18;

function haversineKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function headingDeg(p0: [number, number], p1: [number, number]) {
  const y = Math.sin(((p1[1] - p0[1]) * Math.PI) / 180) * Math.cos((p1[0] * Math.PI) / 180);
  const x =
    Math.cos((p0[0] * Math.PI) / 180) * Math.sin((p1[0] * Math.PI) / 180) -
    Math.sin((p0[0] * Math.PI) / 180) *
      Math.cos((p1[0] * Math.PI) / 180) *
      Math.cos(((p1[1] - p0[1]) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function pointInPoly(pt: [number, number], poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const yi = poly[i][0],
      xi = poly[i][1];
    const yj = poly[j][0],
      xj = poly[j][1];
    const hit = yi > pt[0] !== yj > pt[0] && pt[1] < ((xj - xi) * (pt[0] - yi)) / (yj - yi || 1e-9) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function distPointSegKm(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[1] - a[1]) * dx + (p[0] - a[1]) * dy) / len2));
  return haversineKm(p, [a[0] + t * dy, a[1] + t * dx]);
}

export function routeMissKm(path: [number, number][], slick: Slick) {
  const samples: [number, number][] = [];
  for (let i = 0; i < path.length; i++) samples.push(path[i]);
  for (let i = 1; i < path.length; i++) {
    samples.push([(path[i - 1][0] + path[i][0]) / 2, (path[i - 1][1] + path[i][1]) / 2]);
  }
  let miss = Infinity;
  let onSlick = false;
  for (const pt of samples) {
    if (pointInPoly(pt, slick.poly)) {
      onSlick = true;
      miss = 0;
      break;
    }
    miss = Math.min(miss, haversineKm(pt, [slick.lat, slick.lon]));
    for (let i = 0; i < slick.poly.length; i++) {
      const a = slick.poly[i];
      const b = slick.poly[(i + 1) % slick.poly.length];
      miss = Math.min(miss, distPointSegKm(pt, a, b));
    }
  }
  return { missKm: miss, onSlick };
}

function offset(lat: number, lon: number, km: number, bearingDeg: number): [number, number] {
  const rad = (bearingDeg * Math.PI) / 180;
  return [
    lat + (km / 111) * Math.cos(rad),
    lon + (km / (111 * Math.max(0.35, Math.cos((lat * Math.PI) / 180)))) * Math.sin(rad),
  ];
}

function shiftLane(lane: [number, number][], kmPerp: number): [number, number][] {
  return lane.map((p, i) => {
    const a = lane[Math.max(0, i - 1)];
    const b = lane[Math.min(lane.length - 1, i + 1)];
    return offset(p[0], p[1], kmPerp, headingDeg(a, b) + 90);
  });
}

/** AIS on water lanes whose tracks crossed the slick or passed within 18 km. */
export function fleetThatPassed(slick: Slick, want = 24): TrafficShip[] {
  const r = rng(hashStr(`${slick.id}:pass`));
  const lanes = SEA_LANES[slick.region];
  const kept: TrafficShip[] = [];
  let i = 0;
  while (kept.length < want && i < 80) {
    const lane = lanes[i % lanes.length];
    const kmPerp = (r() - 0.5) * 5;
    const path = shiftLane(lane, kmPerp);
    const { missKm, onSlick } = routeMissKm(path, slick);
    i += 1;
    if (!onSlick && missKm > PASS_KM) continue;
    kept.push({
      mmsi: String(210000000 + (hashStr(`${slick.id}:p:${i}`) % 700000000)),
      name: NAMES[(kept.length + i) % NAMES.length],
      flag: FLAGS[kept.length % FLAGS.length],
      klass: KLASS[kept.length % KLASS.length],
      path,
      phase: r(),
      named: false,
      missKm,
      onSlick,
      dir: i % 2 === 0 ? 1 : -1,
      role: "near",
    });
  }
  kept.sort((a, b) => Number(b.onSlick) - Number(a.onSlick) || a.missKm - b.missKm);
  kept.forEach((s, idx) => {
    s.named = idx < 8;
  });
  return kept;
}

export function alongPath(path: [number, number][], t01: number): [number, number] {
  const f = Math.min(0.999, Math.max(0, t01)) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(f));
  const u = f - i;
  return [path[i][0] + (path[i + 1][0] - path[i][0]) * u, path[i][1] + (path[i + 1][1] - path[i][1]) * u];
}
