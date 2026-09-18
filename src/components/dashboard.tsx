import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  ChartLine,
  Crosshair,
  Droplets,
  Fingerprint,
  Layers,
  LayoutDashboard,
  Map,
  Menu,
  Moon,
  Satellite,
  Settings,
  Ship,
  Sun,
  Wind,
  X,
} from "lucide-react";
import { SLICKS, TRACKS } from "@/lib/oil-data";
import { haversineKm, suspectsFor, type GfwHint } from "@/lib/scoring";
import { liveNow } from "@/lib/ais-buffer";
import { alertsFor, analytics } from "@/lib/ops";
import type { LiveShip } from "@/lib/ais-live";
import { type MapLayers } from "@/components/spill-map";
import { Overview } from "@/components/dashboard-overview";
import { SettingsPanel } from "@/components/dashboard-settings";
import { AlertsPanel, AnalyticsPanel, LayersPanel, Lists, LiveAis, SatPanel } from "@/components/dashboard-panels";
import { cn } from "@/lib/utils";

function aisHeaders(): HeadersInit {
  try {
    const k = sessionStorage.getItem("aisstream-key");
    return k ? { "x-ais-key": k } : {};
  } catch {
    return {};
  }
}

function gfwHeaders(): HeadersInit {
  try {
    const k = sessionStorage.getItem("gfw-key");
    return k ? { "x-gfw-key": k } : {};
  } catch {
    return {};
  }
}

type ViewId =
  | "overview"
  | "map"
  | "sat"
  | "detect"
  | "drift"
  | "ais"
  | "attr"
  | "alerts"
  | "layers"
  | "analytics"
  | "settings";

const NAV: { id: ViewId; label: string; icon: typeof Map }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "map", label: "Live Map", icon: Map },
  { id: "sat", label: "Satellite Monitor", icon: Satellite },
  { id: "detect", label: "Oil Spill Detection", icon: Crosshair },
  { id: "drift", label: "Drift Analysis", icon: Wind },
  { id: "ais", label: "AIS Vessels", icon: Ship },
  { id: "attr", label: "Vessel Attribution", icon: Fingerprint },
  { id: "alerts", label: "Alerts & Reports", icon: Bell },
  { id: "layers", label: "Data Layers", icon: Layers },
  { id: "analytics", label: "Analytics", icon: ChartLine },
  { id: "settings", label: "Settings", icon: Settings },
];

const TITLES: Record<ViewId, string> = {
  overview: "Oil Spill Detection & Vessel Attribution Dashboard",
  map: "Live Map",
  sat: "Satellite Monitor",
  detect: "Oil Spill Detection",
  drift: "Drift Analysis",
  ais: "AIS Vessels",
  attr: "Vessel Attribution",
  alerts: "Alerts & Reports",
  layers: "Data Layers",
  analytics: "Analytics",
  settings: "Settings",
};

export function Dashboard() {
  const [view, setView] = useState<ViewId>("overview");
  const [slickId, setSlickId] = useState(SLICKS[0].id);
  const [forecast, setForecast] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [hoursBack, setHoursBack] = useState(0);
  const [clock, setClock] = useState(() => liveNow(SLICKS[0].when));
  const [gfwOn, setGfwOn] = useState(false);
  const [gfwLast4, setGfwLast4] = useState<string | null>(null);
  const [gfwHints, setGfwHints] = useState<GfwHint[]>([]);
  const [aisOn, setAisOn] = useState(false);
  const [aisLast4, setAisLast4] = useState<string | null>(null);
  const [aisLive, setAisLive] = useState<LiveShip[]>([]);
  const [aisStreaming, setAisStreaming] = useState(false);
  const [sarLive, setSarLive] = useState<{
    item: string;
    when: string;
    bounds?: [number, number, number, number];
  } | null>(null);
  const [layers, setLayers] = useState<MapLayers>({
    slick: true,
    fleet: true,
    suspects: true,
    drift: true,
  });

  const slick = SLICKS.find((s) => s.id === slickId) ?? SLICKS[0];
  const suspects = useMemo(() => suspectsFor(slick, gfwHints), [slick, gfwHints]);
  const alertRows = useMemo(() => alertsFor(gfwHints), [gfwHints]);
  const stats = useMemo(() => analytics(gfwHints), [gfwHints]);
  const top = suspects[0] ?? null;
  const track = top ? TRACKS[top.mmsi] : undefined;

  useEffect(() => {
    void fetch("/api/gfw", { credentials: "include", headers: gfwHeaders() })
      .then((r) => r.json())
      .then((d: { connected?: boolean; last4?: string | null }) => {
        setGfwOn(Boolean(d.connected));
        setGfwLast4(d.last4 ?? null);
      })
      .catch(() => setGfwOn(false));
  }, []);

  useEffect(() => {
    void fetch("/api/ais", { credentials: "include", headers: aisHeaders() })
      .then((r) => r.json())
      .then((d: { connected?: boolean; last4?: string | null }) => {
        setAisOn(Boolean(d.connected));
        setAisLast4(d.last4 ?? null);
      })
      .catch(() => setAisOn(false));
  }, []);

  useEffect(() => {
    if (!aisOn) {
      setAisLive([]);
      setAisStreaming(false);
      return;
    }
    let cancelled = false;
    const pull = () => {
      void fetch(`/api/ais?region=${encodeURIComponent(slick.region)}`, {
        credentials: "include",
        headers: aisHeaders(),
      })
        .then((r) => r.json())
        .then((d: { live?: LiveShip[]; streaming?: boolean; last4?: string | null }) => {
          if (cancelled) return;
          setAisLive(d.live ?? []);
          setAisStreaming(Boolean(d.streaming));
          if (d.last4) setAisLast4(d.last4);
        })
        .catch(() => {
          if (!cancelled) setAisLive([]);
        });
    };
    pull();
    const id = window.setInterval(pull, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [aisOn, slick.region]);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/sar?region=${encodeURIComponent(slick.region)}`)
      .then((r) => r.json())
      .then((d: { item?: string; when?: string; bounds?: [number, number, number, number] }) => {
        if (!cancelled && d.item) setSarLive({ item: d.item, when: d.when ?? "", bounds: d.bounds });
      })
      .catch(() => {
        if (!cancelled) setSarLive(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slick.region]);

  useEffect(() => {
    if (!gfwOn) {
      setGfwHints([]);
      return;
    }
    let cancelled = false;
    void fetch(`/api/gfw?slick=${encodeURIComponent(slick.id)}`, {
      credentials: "include",
      headers: gfwHeaders(),
    })
      .then((r) => r.json())
      .then((d: { hints?: GfwHint[]; live?: boolean }) => {
        if (!cancelled) setGfwHints(d.hints ?? []);
      })
      .catch(() => {
        if (!cancelled) setGfwHints([]);
      });
    return () => {
      cancelled = true;
    };
  }, [gfwOn, slick.id]);

  useEffect(() => {
    setClock(liveNow(slick.when));
    setHoursBack(0);
  }, [slick.id, slick.when]);

  useEffect(() => {
    const id = window.setInterval(() => setClock((c) => c + 120_000), 1500);
    return () => window.clearInterval(id);
  }, []);

  const trajData = useMemo(() => {
    if (!track) return [];
    const origin: [number, number] = [track[0][0], track[0][1]];
    return track.map((p, i) => ({
      t: i,
      km: i === 0 ? 0 : Number(haversineKm(origin, [p[0], p[1]]).toFixed(1)),
    }));
  }, [track]);

  return (
    <div className={cn("flex min-h-dvh bg-bg text-fg", !dark && "light-theme")}>
      {railOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          aria-label="Close menu"
          onClick={() => setRailOpen(false)}
        />
      )}
      <aside
        className={cn(
          "z-40 flex w-56 shrink-0 flex-col border-r border-line bg-rail",
          "fixed inset-y-0 left-0 transition-transform duration-200 md:static md:translate-x-0",
          railOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex items-center gap-2.5 px-4 py-5">
          <span className="grid size-9 place-items-center rounded-full bg-accent text-white">
            <Droplets className="size-4" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-wide">OILGUARD AI</p>
            <p className="text-[11px] text-muted">Marine Pollution Intelligence</p>
          </div>
          <button type="button" className="ml-auto md:hidden" onClick={() => setRailOpen(false)}>
            <X className="size-5 text-muted" />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setView(item.id);
                  setRailOpen(false);
                }}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-left text-sm",
                  on ? "bg-nav-active text-white" : "text-muted hover:bg-white/5 hover:text-fg",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                {item.label}
                {item.id === "alerts" && alertRows.length > 0 && (
                  <span className="ml-auto rounded-full bg-accent px-1.5 text-[10px] text-white">
                    {alertRows.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center gap-3 border-b border-line px-4 md:px-5">
          <button type="button" className="grid size-11 place-items-center md:hidden" onClick={() => setRailOpen(true)}>
            <Menu className="size-5" />
          </button>
          <Menu className="hidden size-5 text-muted md:block" />
          <h1 className="truncate text-base font-semibold md:text-lg">{TITLES[view]}</h1>
          <span
            className={cn(
              "hidden rounded-md border px-2 py-1 text-[10px] uppercase tracking-wide sm:inline",
              gfwOn ? "border-good/40 text-good" : "border-line text-muted",
            )}
          >
            {gfwOn ? `GFW live ·${gfwLast4 ?? ""}` : "GFW demo"}
          </span>
          <span
            className={cn(
              "hidden rounded-md border px-2 py-1 text-[10px] uppercase tracking-wide md:inline",
              aisOn ? "border-good/40 text-good" : "border-line text-muted",
            )}
          >
            {aisOn ? `AIS ${aisStreaming ? "live" : "idle"} ·${aisLast4 ?? ""}` : "AIS demo"}
          </span>
          <button
            type="button"
            className="ml-auto grid size-11 place-items-center rounded-lg border border-line"
            onClick={() => setDark((d) => !d)}
            aria-label="Toggle theme"
          >
            {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
        </header>

        <main className="relative min-h-0 flex-1 overflow-auto p-3 md:p-4">
          <div
            className={
              view === "overview" || view === "map" || view === "drift"
                ? "h-full"
                : "pointer-events-none invisible absolute inset-3"
            }
          >
            <Overview
              slick={slick}
              setSlickId={setSlickId}
              forecast={forecast}
              setForecast={setForecast}
              top={top}
              suspects={suspects}
              trajData={trajData}
              full={view === "map"}
              clock={clock}
              hoursBack={hoursBack}
              setHoursBack={setHoursBack}
              gfwOn={gfwOn}
              layers={layers}
              liveShips={aisLive}
              sarItem={sarLive}
            />
          </div>
          {view === "detect" || view === "attr" ? (
            <Lists slick={slick} setSlickId={setSlickId} gfwOn={gfwOn} hints={gfwHints} />
          ) : view === "ais" ? (
            <LiveAis slick={slick} clock={clock} hoursBack={hoursBack} live={aisLive} aisOn={aisOn} />
          ) : view === "sat" ? (
            <SatPanel slick={slick} gfwOn={gfwOn} />
          ) : view === "alerts" ? (
            <AlertsPanel
              rows={alertRows}
              onOpen={(id) => {
                setSlickId(id);
                setView("attr");
              }}
            />
          ) : view === "layers" ? (
            <LayersPanel layers={layers} setLayers={setLayers} />
          ) : view === "analytics" ? (
            <AnalyticsPanel stats={stats} />
          ) : view === "settings" ? (
            <SettingsPanel
              gfwOn={gfwOn}
              last4={gfwLast4}
              onStatus={(on, last4) => {
                setGfwOn(on);
                setGfwLast4(last4);
              }}
              aisOn={aisOn}
              aisLast4={aisLast4}
              onAis={(on, last4) => {
                setAisOn(on);
                setAisLast4(last4);
                if (!on) setAisLive([]);
              }}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
