import {
  SAR_SCENES,
  type Slick,
} from "@/lib/oil-data";

export type MapLayers = {
  slick: boolean;
  fleet: boolean;
  suspects: boolean;
  drift: boolean;
};

export type Mover = {
  marker: import("leaflet").Marker;
  line: import("leaflet").Polyline;
  fixes: import("@/lib/ais-buffer").AisFix[];
  route: [number, number][];
  dir: 1 | -1;
  original: boolean;
  wallClock: boolean;
};

export type MapInst = {
  map: import("leaflet").Map;
  layers: import("leaflet").LayerGroup;
  live: import("leaflet").LayerGroup;
  ais: import("leaflet").LayerGroup;
  movers: Mover[];
  base: import("leaflet").TileLayer | null;
  fallback: import("leaflet").TileLayer | null;
  fitted: string | null;
};

const OPTICAL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const CLEAR_TILE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function sarTileUrl(item: string) {
  return `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}.png?collection=sentinel-1-rtc&item=${item}&assets=vv&rescale=0,0.35&colormap_name=gray`;
}

export function applyBase(
  L: typeof import("leaflet"),
  inst: MapInst,
  slick: Slick,
  mode: "sar" | "optical",
  liveSar?: { item: string; when: string; bounds?: [number, number, number, number] } | null,
) {
  if (!inst.fallback) {
    inst.fallback = L.tileLayer(OPTICAL, { maxZoom: 17 }).addTo(inst.map);
  }
  const wrap = inst.fallback.getContainer();
  wrap?.classList.toggle("sar-fallback", mode === "sar");
  inst.base?.remove();
  inst.base = null;
  if (mode === "sar") {
    const scene = liveSar ?? SAR_SCENES[slick.id];
    if (scene) {
      const extra =
        liveSar?.bounds && liveSar.bounds.length === 4
          ? {
              bounds: L.latLngBounds(
                [liveSar.bounds[0], liveSar.bounds[1]],
                [liveSar.bounds[2], liveSar.bounds[3]],
              ),
            }
          : {};
      inst.base = L.tileLayer(sarTileUrl(scene.item), {
        maxZoom: 14,
        maxNativeZoom: 13,
        opacity: 0.88,
        errorTileUrl: CLEAR_TILE,
        ...extra,
      }).addTo(inst.map);
    }
  }
  inst.fallback.bringToBack();
  inst.base?.bringToFront();
}

export function sheen(poly: [number, number][], halfWidthDeg: number): [number, number][] {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[Math.max(0, i - 1)];
    const b = poly[Math.min(poly.length - 1, i + 1)];
    const dx = b[1] - a[1];
    const dy = b[0] - a[0];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfWidthDeg;
    const ny = (dx / len) * halfWidthDeg;
    left.push([poly[i][0] + ny, poly[i][1] + nx]);
    right.push([poly[i][0] - ny, poly[i][1] - nx]);
  }
  return [...left, ...right.reverse()];
}
