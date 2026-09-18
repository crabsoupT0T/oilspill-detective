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
