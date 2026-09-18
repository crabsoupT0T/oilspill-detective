import { useEffect, useState, type ComponentProps } from "react";
import { FileDown } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { REGIONS, SLICKS, type Slick } from "@/lib/oil-data";
import { suspectsFor } from "@/lib/scoring";
import { downloadCase, printCase } from "@/lib/ops";
import type { LiveShip } from "@/lib/ais-live";
import { SpillMap, type MapLayers } from "@/components/spill-map";
import { cn } from "@/lib/utils";

function ClientSpillMap(props: ComponentProps<typeof SpillMap>) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <div className="absolute inset-0 min-h-[280px] bg-card" />;
  return <SpillMap {...props} />;
}

export function Overview({
  slick,
  setSlickId,
  forecast,
  setForecast,
  top,
  suspects,
  trajData,
  full,
  clock,
  hoursBack,
  setHoursBack,
  gfwOn,
  layers,
  liveShips,
  sarItem,
}: {
  slick: Slick;
  setSlickId: (id: string) => void;
  forecast: boolean;
  setForecast: (v: boolean) => void;
  top: ReturnType<typeof suspectsFor>[0] | null;
  suspects: ReturnType<typeof suspectsFor>;
  trajData: { t: number; km: number }[];
  full: boolean;
  clock: number;
  hoursBack: number;
  setHoursBack: (h: number) => void;
  gfwOn: boolean;
  layers: MapLayers;
  liveShips: LiveShip[];
  sarItem: { item: string; when: string; bounds?: [number, number, number, number] } | null;
}) {
  return (
    <div className={cn("flex flex-col gap-3", full ? "h-full" : "")}>
      <section className="flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-xl border border-line bg-card md:min-h-[340px]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="text-base font-semibold md:text-lg">Sentinel-1 SAR · Spill & AIS</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm" onClick={() => printCase(slick, suspects, gfwOn)}>
              <FileDown className="size-4" />
              Case file
            </button>
            <div className="flex rounded-lg bg-rail p-0.5">
              <button type="button" className={cn("rounded-md px-3 py-1.5 text-sm", !forecast ? "bg-accent text-white" : "text-muted")} onClick={() => setForecast(false)}>
                Current Location
              </button>
              <button type="button" className={cn("rounded-md px-3 py-1.5 text-sm", forecast ? "bg-accent text-white" : "text-muted")} onClick={() => setForecast(true)}>
                Forecast (72h)
              </button>
            </div>
          </div>
        </div>
        <div className="relative min-h-[280px] flex-1 md:min-h-[360px]">
          <ClientSpillMap slick={slick} suspects={suspects} forecast={forecast} clock={clock} hoursBack={hoursBack} onHoursBack={setHoursBack} layers={layers} liveShips={liveShips} sarItem={sarItem} />
          <select className="absolute bottom-28 left-3 z-20 rounded-md border border-line bg-card/90 px-2 py-1.5 text-xs" value={slick.id} onChange={(e) => setSlickId(e.target.value)} aria-label="Select slick">
            {SLICKS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {REGIONS[s.region].label}
              </option>
            ))}
          </select>
        </div>
      </section>
      {!full && (
        <div className="grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-xl border border-line bg-card p-4">
            <h2 className="text-base font-semibold">Vessel Trajector(ies)</h2>
            <p className="mt-1 text-xl font-medium">{top?.vessel.name ?? "No match"}</p>
            <div className="mt-2 h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trajData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="transparent" />
                  <XAxis dataKey="t" hide />
                  <YAxis hide />
                  <Line type="monotone" dataKey="km" stroke="#e23b3b" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="rounded-xl border border-line bg-card p-4">
            <h2 className="text-base font-semibold">Key Metrics</h2>
            <p className="mt-3 text-sm text-muted">Total Spill Area</p>
            <p className="text-4xl font-bold tabular-nums">{slick.areaKm2.toFixed(1)} km²</p>
            <p className="mt-3 text-sm text-muted">Model Confidence</p>
            <p className="text-4xl font-bold tabular-nums text-good">{(slick.confidence * 100).toFixed(1)}%</p>
            <p className="mt-3 text-sm">
              Top Candidate: <span className="font-semibold">{top?.vessel.name ?? "—"}</span>
            </p>
            <button type="button" className="mt-3 text-xs text-accent underline decoration-white/20" onClick={() => downloadCase(slick, suspects, gfwOn)}>
              Download HTML case file
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
