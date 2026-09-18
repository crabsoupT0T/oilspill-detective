export type LiveFix = { lat: number; lon: number; t: number };

export type LiveShip = {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  sog: number;
  cog: number;
  t: number;
  path: LiveFix[];
};

export type AisStatus = {
  connected: boolean;
  streaming: boolean;
  source: "saved" | "env" | "none";
  last4: string | null;
  ships: number;
  error?: string;
};
