export type RegionId = "hormuz" | "med" | "malacca" | "gom" | "black";

export type Vessel = {
  mmsi: string;
  imo: string;
  name: string;
  flag: string;
  type: "tanker" | "cargo" | "bunker" | "platform";
  class: string;
  dark?: boolean;
};

export type Slick = {
  id: string;
  region: RegionId;
  when: string;
  scene: string;
  confidence: number;
  areaKm2: number;
  lengthKm: number;
  class: string;
  lat: number;
  lon: number;
  poly: [number, number][];
  notes: string;
};

export type Platform = {
  id: string;
  name: string;
  kind: "platform";
  region: RegionId;
  lat: number;
  lon: number;
};

export const REGIONS: Record<RegionId, { center: [number, number]; zoom: number; label: string }> = {
  hormuz: { center: [26.2, 56.3], zoom: 7, label: "Strait of Hormuz / Gulf" },
  med: { center: [33.8, 32.5], zoom: 6, label: "Eastern Mediterranean" },
  malacca: { center: [1.3, 103.8], zoom: 8, label: "Malacca / Singapore Strait" },
  gom: { center: [27.8, -90.2], zoom: 6, label: "Gulf of Mexico" },
  black: { center: [43.2, 31.0], zoom: 6, label: "Black Sea" },
};

/** TSS / deep-water lanes — stay off land. [lat, lon] */
export const SEA_LANES: Record<RegionId, [number, number][][]> = {
  hormuz: [
    [
      [24.55, 58.15],
      [25.05, 57.55],
      [25.55, 57.05],
      [25.95, 56.75],
      [26.22, 56.58],
      [26.38, 56.48],
      [26.42, 56.32],
      [26.38, 55.85],
      [26.15, 54.95],
      [25.75, 53.85],
      [25.25, 52.95],
      [24.85, 52.45],
      [24.45, 52.15],
    ],
    [
      [24.85, 58.25],
      [25.35, 57.65],
      [25.85, 57.12],
      [26.28, 56.78],
      [26.48, 56.54],
      [26.55, 56.28],
      [26.5, 55.55],
      [26.22, 54.45],
      [25.72, 53.45],
      [25.15, 52.65],
      [24.7, 52.25],
    ],
  ],
  med: [
    [
      [32.15, 30.4],
      [32.55, 31.15],
      [33.05, 31.75],
      [33.45, 32.05],
      [33.7, 32.25],
      [34.15, 32.85],
      [34.55, 33.55],
      [34.75, 34.35],
      [34.7, 35.1],
    ],
    [
      [31.95, 30.7],
      [32.4, 31.45],
      [32.9, 32.0],
      [33.35, 32.35],
      [33.85, 32.95],
      [34.25, 33.75],
      [34.45, 34.55],
    ],
  ],
  malacca: [
    [
      [3.55, 100.35],
      [2.85, 101.15],
      [2.15, 101.95],
      [1.55, 102.85],
      [1.28, 103.45],
      [1.2, 103.75],
      [1.18, 104.15],
      [1.22, 104.65],
      [1.35, 105.15],
    ],
    [
      [3.35, 100.55],
      [2.65, 101.4],
      [1.95, 102.25],
      [1.42, 103.05],
      [1.22, 103.55],
      [1.16, 103.9],
      [1.25, 104.4],
      [1.45, 104.95],
    ],
  ],
  gom: [
    [
      [26.85, -93.6],
      [27.35, -92.2],
      [27.75, -91.0],
      [28.05, -89.85],
      [28.2, -89.15],
      [28.25, -88.35],
      [27.95, -87.2],
      [27.35, -86.3],
    ],
    [
      [26.55, -93.2],
      [27.05, -91.8],
      [27.55, -90.4],
      [27.9, -89.4],
      [28.05, -88.55],
      [27.7, -87.45],
      [27.15, -86.5],
    ],
  ],
  black: [
    [
      [42.15, 28.55],
      [42.55, 29.35],
      [43.05, 30.15],
      [43.35, 30.7],
      [43.45, 31.35],
      [43.55, 32.25],
      [43.65, 33.2],
      [43.45, 34.1],
    ],
    [
      [41.95, 29.0],
      [42.45, 29.85],
      [42.95, 30.55],
      [43.25, 31.15],
      [43.35, 32.05],
      [43.25, 33.15],
      [42.95, 34.0],
    ],
  ],
};

export const PLATFORMS: Platform[] = [
  { id: "P-GOM-12", name: "Mars TLP", kind: "platform", region: "gom", lat: 28.17, lon: -89.22 },
  { id: "P-GOM-07", name: "Thunder Horse", kind: "platform", region: "gom", lat: 28.19, lon: -88.5 },
  { id: "P-HZ-03", name: "Upper Zakum field cluster", kind: "platform", region: "hormuz", lat: 24.85, lon: 53.65 },
];

export const VESSELS: Vessel[] = [
  { mmsi: "636019881", imo: "9812345", name: "NORDIC AURORA", flag: "LR", type: "tanker", class: "Aframax crude" },
  { mmsi: "636021104", imo: "9728810", name: "PACIFIC HELIOS", flag: "LR", type: "tanker", class: "Suezmax" },
  { mmsi: "249057000", imo: "9331105", name: "MALTA PEARL", flag: "MT", type: "tanker", class: "Product tanker" },
  { mmsi: "538008441", imo: "9782200", name: "OCEAN CREST", flag: "MH", type: "tanker", class: "VLCC" },
  { mmsi: "563084700", imo: "9610020", name: "MERLION TRADER", flag: "SG", type: "cargo", class: "Container" },
  { mmsi: "477335500", imo: "9447862", name: "PEARL RIVER", flag: "HK", type: "cargo", class: "Bulk" },
  { mmsi: "538009012", imo: "9704418", name: "GULF BUNKER 9", flag: "MH", type: "bunker", class: "Bunker barge" },
  { mmsi: "273354810", imo: "9172200", name: "CHERNOMOR", flag: "RU", type: "tanker", class: "Product tanker" },
  { mmsi: "256846000", imo: "9287710", name: "VALLETTA STAR", flag: "MT", type: "tanker", class: "Handymax products" },
  { mmsi: "353118000", imo: "9410029", name: "DARK HORIZON", flag: "PA", type: "tanker", class: "Aframax", dark: true },
];

export { SLICKS, SAR_SCENES } from "./oil-slicks";
export { TRACKS, AIS_GAPS } from "./oil-tracks";
export type { TrafficShip } from "./oil-fleet";
export { fleetThatPassed, alongPath, routeMissKm } from "./oil-fleet";
