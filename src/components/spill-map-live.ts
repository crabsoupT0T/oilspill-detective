import { TRACKS, VESSELS, type Slick, type TrafficShip } from "@/lib/oil-data";
import { WINDOW_H, advanceAlong, clipFixes, type AisFix } from "@/lib/ais-buffer";
import { driftEnd, roleLabel, type Suspect } from "@/lib/scoring";
import type { LiveShip } from "@/lib/ais-live";
import { sheen, type MapInst, type MapLayers } from "./spill-map-draw";

function rolePaint(role: "source" | "transit" | "near") {
  if (role === "source") return { dot: "#ff3b3b", track: "#c4232a" };
  if (role === "transit") return { dot: "#8fd4ff", track: "#6aa8d4" };
  return { dot: "#7a90a8", track: "#4d6278" };
}

export function seed(
  L: typeof import("leaflet"),
  inst: MapInst,
  {
    slick,
    suspects,
    forecast,
    clock,
    layers,
  }: {
    slick: Slick;
    suspects: Suspect[];
    forecast: boolean;
    clock: number;
    hoursBack: number;
    layers: MapLayers;
    liveShips: LiveShip[];
  },
) {
  inst.layers.clearLayers();
  inst.live.clearLayers();
  inst.movers = [];

  const dest = driftEnd(slick, forecast);
  const fat =
    slick.class === "linear-vessel"
      ? { outer: 0.01, inner: 0.0045 }
      : slick.class === "platform-seep"
        ? { outer: 0.028, inner: 0.012 }
        : { outer: 0.016, inner: 0.007 };
  const outer = sheen(slick.poly, fat.outer);
  const inner = sheen(slick.poly, fat.inner);

  if (layers.slick) {
    L.polygon(outer, {
      color: "#6b3d8a",
      weight: 1.5,
      fillColor: "#1a0b22",
      fillOpacity: 0.55,
    }).addTo(inst.layers);
    L.polygon(inner, {
      color: "#9b6bc4",
      weight: 2.5,
      fillColor: "#2a1038",
      fillOpacity: 0.88,
    })
      .bindPopup(
        `<strong>Oil slick ${slick.id}</strong><br/>${slick.areaKm2} km² · ${slick.lengthKm} km sheen<br/>${slick.class} · ${(slick.confidence * 100).toFixed(0)}% confidence<br/>Vessel dumps read as a long filament on SAR — not a square.`,
      )
      .addTo(inst.layers);
    L.polyline(slick.poly, { color: "#c9a0ff", weight: 2, opacity: 0.9 }).addTo(inst.layers);
    L.marker([slick.lat, slick.lon], {
      icon: L.divIcon({
        className: "ship-mark",
        html: `<span class="slick-tag">OIL SLICK · ${slick.lengthKm} km</span>`,
        iconSize: [12, 12],
        iconAnchor: [6, 18],
      }),
      zIndexOffset: 800,
      interactive: false,
    }).addTo(inst.layers);
  }

  if (layers.suspects) {
    suspects.forEach((s) => {
      const track = TRACKS[s.mmsi];
      if (!track?.length) return;
      const fixes: AisFix[] = track.map(([lat, lon, iso]) => ({
        t: Date.parse(iso),
        lat,
        lon,
      }));
      const path = fixes.map((f) => [f.lat, f.lon] as [number, number]);
      const paint = rolePaint(s.role);
      const v = VESSELS.find((x) => x.mmsi === s.mmsi);
      const dummy: TrafficShip = {
        mmsi: s.mmsi,
        name: v?.name ?? s.vessel.name,
        flag: s.vessel.flag,
        klass: s.vessel.class,
        path,
        phase: 0,
        named: true,
        missKm: s.distKm,
        onSlick: s.role === "source",
        dir: 1,
        role: s.role,
      };
      addMover(L, inst, dummy, fixes, paint.dot, paint.track, true, true, false);
    });
  }

  if (layers.drift) {
    L.polyline(
      [
        [slick.lat, slick.lon],
        dest,
      ],
      { color: "#7cff6b", weight: 3, dashArray: "8 7" },
    ).addTo(inst.layers);
    L.circleMarker(dest, {
      radius: 7,
      color: "#fff",
      weight: 1,
      fillColor: "#7cff6b",
      fillOpacity: 1,
    }).addTo(inst.layers);
  }

  inst.map.invalidateSize();
  if (inst.fitted !== slick.id) {
    inst.map.fitBounds(L.latLngBounds(outer).pad(0.55), { maxZoom: forecast ? 8 : 10 });
    inst.fitted = slick.id;
  }
}

export function paintLive(
  L: typeof import("leaflet"),
  inst: MapInst,
  ships: LiveShip[],
  show: boolean,
  hoursBack: number,
) {
  inst.ais.clearLayers();
  if (!show || !ships.length) return;
  const now = Date.now();
  for (const ship of ships.slice(0, 60)) {
    const fixes: AisFix[] = ship.path.map((p) => ({ t: p.t, lat: p.lat, lon: p.lon }));
    if (!fixes.length) fixes.push({ t: ship.t, lat: ship.lat, lon: ship.lon });
    const trail = fixes.map((f) => [f.lat, f.lon] as [number, number]);
    if (trail.length >= 2) {
      L.polyline(trail, { color: "#8fd4ff", weight: 2, opacity: 0.85 }).addTo(inst.ais);
    }
    const here = livePlace(fixes, ship, hoursBack, now);
    const safe = ship.name.replace(/[<>&"]/g, "");
    const named = safe !== "UNKNOWN";
    const icon = L.divIcon({
      className: "ship-mark",
      html: named
        ? `<span class="ship-dot live" style="background:#8fd4ff"></span><span class="ship-name">${safe}</span>`
        : `<span class="ship-dot live" style="background:#8fd4ff"></span>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
    L.marker(here, { icon, zIndexOffset: 400 })
      .bindPopup(
        `<strong>${safe}</strong><br/>MMSI ${ship.mmsi}<br/>SOG ${ship.sog.toFixed(1)} kn · COG ${ship.cog.toFixed(0)}°<br/>Original AIS track`,
      )
      .addTo(inst.ais);
  }
}

function livePlace(fixes: AisFix[], ship: LiveShip, hoursBack: number, now: number): [number, number] {
  if (hoursBack >= 0.2) {
    const { pos } = clipFixes(fixes, now - hoursBack * 3600 * 1000);
    if (pos) return pos;
  }
  if (fixes.length >= 2) {
    const t0 = fixes[0].t;
    const t1 = fixes[fixes.length - 1].t;
    const span = Math.max(8000, t1 - t0);
    const loop = Math.min(40000, Math.max(18000, span));
    const u = (now % loop) / loop;
    const { pos } = clipFixes(fixes, t0 + u * span);
    if (pos) return pos;
  }
  const last = fixes[fixes.length - 1] ?? { lat: ship.lat, lon: ship.lon, t: ship.t };
  const dtH = Math.max(0, (now - last.t) / 3.6e6);
  const km = Math.min(25, ship.sog * 1.852 * dtH);
  const rad = (ship.cog * Math.PI) / 180;
  const lat = last.lat + (km / 111) * Math.cos(rad);
  const lon = last.lon + (km / (111 * Math.max(0.3, Math.cos((last.lat * Math.PI) / 180)))) * Math.sin(rad);
  return [lat, lon];
}

function addMover(
  L: typeof import("leaflet"),
  inst: MapInst,
  ship: TrafficShip,
  fixes: AisFix[],
  color: string,
  trackColor: string,
  named: boolean,
  original = false,
  wallClock = false,
) {
  const line = L.polyline(
    fixes.map((f) => [f.lat, f.lon] as [number, number]),
    { color: trackColor, weight: named ? 2.4 : 1.6, opacity: 0.7 },
  ).addTo(inst.layers);
  const last = fixes[fixes.length - 1];
  const icon = L.divIcon({
    className: "ship-mark",
    html: named || ship.named
      ? `<span class="ship-dot live" style="background:${color}"></span><span class="ship-name">${ship.name}</span>`
      : `<span class="ship-dot live" style="background:${color}"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
  const how = roleLabel(ship.role);
  const marker = L.marker([last.lat, last.lon], { icon, zIndexOffset: named ? 500 : 200 })
    .bindPopup(
      `<strong>${ship.name}</strong><br/>${ship.flag} · ${ship.klass}<br/>MMSI ${ship.mmsi}<br/>${how}${original ? "<br/>Original AIS track" : ""}`,
    )
    .addTo(inst.live);
  inst.movers.push({ marker, line, fixes, route: ship.path, dir: ship.dir, original, wallClock });
}

export function applyTime(
  inst: MapInst,
  clock: number,
  hoursBack: number,
  setStored: (h: number) => void,
) {
  const view = (inst.movers.some((m) => m.wallClock) ? Date.now() : clock) - hoursBack * 3600 * 1000;
  let oldest = clock;
  let newest = 0;
  for (const m of inst.movers) {
    if (!m.original) m.fixes = advanceAlong(m.fixes, clock, m.route, m.dir);
    const t = m.wallClock ? Date.now() - hoursBack * 3600 * 1000 : view;
    const { path, pos } = clipFixes(m.fixes, t);
    if (path.length >= 2) m.line.setLatLngs(path);
    else if (path.length === 1) m.line.setLatLngs([path[0], path[0]]);
    if (pos) m.marker.setLatLng(pos);
    if (m.fixes.length) {
      oldest = Math.min(oldest, m.fixes[0].t);
      newest = Math.max(newest, m.fixes[m.fixes.length - 1].t);
    }
  }
  setStored(Math.min(WINDOW_H, Math.max(0, (newest - oldest) / 3.6e6)));
}
