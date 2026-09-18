import { useEffect, useRef, useState } from "react";
import { SAR_SCENES, type Slick } from "@/lib/oil-data";
import { WINDOW_H } from "@/lib/ais-buffer";
import type { Suspect } from "@/lib/scoring";
import type { LiveShip } from "@/lib/ais-live";
import { TimeDial } from "@/components/time-dial";
import { applyBase, applyTime, paintLive, seed, type MapInst } from "./spill-map-draw";
import type { MapLayers as DrawLayers } from "./spill-map-draw";

export type MapLayers = DrawLayers;

const ALL_LAYERS: MapLayers = { slick: true, fleet: true, suspects: true, drift: true };

export function SpillMap({
  slick,
  suspects,
  forecast,
  clock,
  hoursBack,
  onHoursBack,
  layers = ALL_LAYERS,
  liveShips = [],
  sarItem,
}: {
  slick: Slick;
  suspects: Suspect[];
  forecast: boolean;
  clock: number;
  hoursBack: number;
  onHoursBack: (h: number) => void;
  layers?: MapLayers;
  liveShips?: LiveShip[];
  sarItem?: { item: string; when: string; bounds?: [number, number, number, number] } | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInst | null>(null);
  const [mode, setMode] = useState<"sar" | "optical">("sar");
  const [stored, setStored] = useState(WINDOW_H);
  const [liveTick, setLiveTick] = useState(0);
  const propsRef = useRef({ slick, suspects, forecast, mode, clock, hoursBack, layers, liveShips, sarItem });
  propsRef.current = { slick, suspects, forecast, mode, clock, hoursBack, layers, liveShips, sarItem };

  useEffect(() => {
    if (!el.current) return;
    let cancelled = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !el.current) return;

      const map = L.map(el.current, {
        zoomControl: true,
        attributionControl: false,
        worldCopyJump: true,
      }).setView([propsRef.current.slick.lat, propsRef.current.slick.lon], 9);

      const inst: MapInst = {
        map,
        layers: L.layerGroup().addTo(map),
        live: L.layerGroup().addTo(map),
        ais: L.layerGroup().addTo(map),
        movers: [],
        base: null,
        fallback: null,
        fitted: null,
      };
      mapRef.current = inst;
      applyBase(L, inst, propsRef.current.slick, propsRef.current.mode, propsRef.current.sarItem);
      seed(L, inst, propsRef.current);
      applyTime(inst, propsRef.current.clock, propsRef.current.hoursBack, setStored);
      const ro = new ResizeObserver(() => inst.map.invalidateSize());
      ro.observe(el.current);
      window.setTimeout(() => inst.map.invalidateSize(), 80);
      (inst as MapInst & { ro?: ResizeObserver }).ro = ro;
    })();

    return () => {
      cancelled = true;
      (mapRef.current as (MapInst & { ro?: ResizeObserver }) | null)?.ro?.disconnect();
      mapRef.current?.map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const inst = mapRef.current;
    if (!inst) return;
    void import("leaflet").then((mod) => {
      applyBase(mod.default, inst, slick, mode, sarItem);
      seed(mod.default, inst, propsRef.current);
      applyTime(inst, clock, hoursBack, setStored);
      inst.map.invalidateSize();
    });
  }, [slick.id, forecast, mode, layers.slick, layers.fleet, layers.suspects, layers.drift, sarItem?.item]);

  useEffect(() => {
    const inst = mapRef.current;
    if (!inst) return;
    void import("leaflet").then((mod) => {
      paintLive(mod.default, inst, liveShips, layers.fleet, hoursBack);
      if (!inst.map.hasLayer(inst.live)) inst.live.addTo(inst.map);
      applyTime(inst, clock, hoursBack, setStored);
    });
  }, [liveShips, layers.fleet, hoursBack, clock, liveTick]);

  useEffect(() => {
    if (hoursBack >= 0.2) return;
    const id = window.setInterval(() => setLiveTick((n) => n + 1), 280);
    return () => window.clearInterval(id);
  }, [hoursBack]);

  const scene = sarItem ?? SAR_SCENES[slick.id];

  return (
    <>
      <div ref={el} className="absolute inset-0 z-0 min-h-[280px]" aria-label="Spill location map" />
      <div className="absolute left-3 top-3 z-20 flex rounded-lg border border-line bg-card/90 p-0.5 text-xs">
        <button
          type="button"
          className={`rounded-md px-2.5 py-1.5 ${mode === "sar" ? "bg-accent text-white" : "text-muted"}`}
          onClick={() => setMode("sar")}
        >
          Sentinel-1 SAR
        </button>
        <button
          type="button"
          className={`rounded-md px-2.5 py-1.5 ${mode === "optical" ? "bg-accent text-white" : "text-muted"}`}
          onClick={() => setMode("optical")}
        >
          Optical
        </button>
      </div>
      <div className="absolute bottom-3 left-3 right-3 z-20">
        <TimeDial hoursBack={hoursBack} onChange={onHoursBack} storedHours={stored} />
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted">
          <span>
            {hoursBack < 0.12 ? "Live AIS" : `Replay −${hoursBack.toFixed(0)}h`} UTC
            {scene && mode === "sar" ? ` · S1 ${scene.when.slice(0, 10)}` : ""}
          </span>
          <span className="ml-auto">
            <a className="underline decoration-white/20 hover:text-fg" href="https://leafletjs.com" target="_blank" rel="noreferrer">
              Leaflet
            </a>
            {" · "}
            {mode === "sar" ? (
              <>
                Contains modified{" "}
                <a className="underline decoration-white/20 hover:text-fg" href="https://www.esa.int/Applications/Observing_the_Earth/Copernicus" target="_blank" rel="noreferrer">
                  Copernicus Sentinel-1
                </a>{" "}
                data ·{" "}
                <a className="underline decoration-white/20 hover:text-fg" href="https://planetarycomputer.microsoft.com" target="_blank" rel="noreferrer">
                  Planetary Computer
                </a>
                {" · "}
                <a className="underline decoration-white/20 hover:text-fg" href="https://globalfishingwatch.org" target="_blank" rel="noreferrer">
                  Global Fishing Watch
                </a>
                {" · "}
                <a className="underline decoration-white/20 hover:text-fg" href="https://aisstream.io/" target="_blank" rel="noreferrer">
                  AISStream
                </a>
              </>
            ) : (
              <a className="underline decoration-white/20 hover:text-fg" href="https://www.esri.com" target="_blank" rel="noreferrer">
                Tiles © Esri
              </a>
            )}
          </span>
        </p>
      </div>
    </>
  );
}
