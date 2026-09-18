import { useMemo } from "react";
import { FileDown } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { REGIONS, SAR_SCENES, SLICKS, fleetThatPassed, type Slick } from "@/lib/oil-data";
import { suspectsFor, type GfwHint } from "@/lib/scoring";
import { clipFixes, timedFleet } from "@/lib/ais-buffer";
import { alertsFor, analytics, printCase } from "@/lib/ops";
import type { LiveShip } from "@/lib/ais-live";
import type { MapLayers } from "@/components/spill-map";
import { cn } from "@/lib/utils";

export function Lists({
  slick,
  setSlickId,
  gfwOn,
  hints,
}: {
  slick: Slick;
  setSlickId: (id: string) => void;
  gfwOn: boolean;
  hints: GfwHint[];
}) {
  const suspects = suspectsFor(slick, hints);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-3 font-semibold">Detected slicks</h2>
        <ul className="flex flex-col gap-2">
          {SLICKS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSlickId(s.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-3 text-left text-sm",
                  s.id === slick.id ? "border-accent bg-rail" : "border-line hover:border-accent/50",
                )}
              >
                <span className="float-right tabular-nums text-good">{(s.confidence * 100).toFixed(0)}%</span>
                <span className="font-medium">{s.id}</span>
                <span className="mt-1 block text-xs text-muted">
                  {s.when.replace("T", " ").replace("Z", " UTC")} · {s.areaKm2} km²
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-2 font-semibold">Attribution · {slick.id}</h2>
        <p className="mb-3 text-sm text-muted">
          Crossing a spreading slick is not enough. The source is the ship at the origin when the oil
          appeared. Ships that steam through later are transits, not culprits.
          {gfwOn
            ? " Identity and AIS-off events are live from Global Fishing Watch."
            : " Add a GFW token in Settings to resolve identity and AIS-off gaps."}
        </p>
        <p className="mb-3 text-sm text-muted">{slick.notes}</p>
        <ol className="flex flex-col gap-2">
          {suspects.map((s, i) => (
            <li key={s.mmsi} className="rounded-lg border border-line p-3 text-sm">
              <p className="font-medium">
                #{i + 1} {s.vessel.name}{" "}
                <span className="text-muted">({(s.score * 100).toFixed(0)})</span>
                <span
                  className={cn(
                    "ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase",
                    s.role === "source" && "bg-accent/20 text-accent",
                    s.role === "transit" && "bg-white/10 text-muted",
                    s.role === "near" && "bg-white/5 text-muted",
                  )}
                >
                  {s.role}
                </span>
                {s.gfwLive && (
                  <span className="ml-1 rounded px-1.5 py-0.5 text-[10px] uppercase text-good">GFW</span>
                )}
              </p>
              <p className="text-xs text-muted">
                {s.vessel.flag} · {s.vessel.class} · MMSI {s.vessel.mmsi}
              </p>
              <p className="mt-1 text-xs text-muted">{s.reasons.join(" · ")}</p>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-sm"
          onClick={() => printCase(slick, suspects, gfwOn)}
        >
          <FileDown className="size-4" />
          Print case file
        </button>
      </section>
    </div>
  );
}

export function LiveAis({
  slick,
  clock,
  hoursBack,
  live,
  aisOn,
}: {
  slick: Slick;
  clock: number;
  hoursBack: number;
  live: LiveShip[];
  aisOn: boolean;
}) {
  const view = clock - hoursBack * 3600 * 1000;
  const demo = useMemo(() => {
    const fleet = timedFleet(fleetThatPassed(slick, 24), slick, clock);
    return fleet
      .map((ship) => {
        const { pos } = clipFixes(ship.fixes, view);
        return pos
          ? {
              mmsi: ship.mmsi,
              name: ship.name,
              role: ship.role,
              lat: pos[0],
              lon: pos[1],
              missKm: ship.missKm,
              sog: 13,
              cog: 0,
            }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [slick, clock, hoursBack, view]);

  const rows = aisOn && live.length
    ? live.map((s) => ({
        mmsi: s.mmsi,
        name: s.name,
        role: "live" as const,
        lat: s.lat,
        lon: s.lon,
        missKm: 0,
        sog: s.sog,
        cog: s.cog,
      }))
    : demo;

  return (
    <section className="overflow-x-auto rounded-xl border border-line bg-card p-4">
      <h2 className="mb-1 font-semibold">Live AIS · 72h buffer</h2>
      <p className="mb-3 text-sm text-muted">
        {aisOn && live.length
          ? `AISStream live · ${live.length} ships in this box · oldest dropped after 72h`
          : aisOn
            ? "AISStream is connected. This box has no coastal receivers right now — open a Singapore or Eastern Med slick to see live dots."
            : `Positions at ${new Date(view).toISOString().slice(0, 16).replace("T", " ")} UTC · demo lanes until an AISStream key is saved`}
      </p>
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-muted">
          <tr>
            <th className="py-2 font-medium">Name</th>
            <th className="font-medium">Role</th>
            <th className="font-medium">Lat</th>
            <th className="font-medium">Lon</th>
            <th className="font-medium">SOG</th>
            <th className="font-medium">MMSI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.mmsi} className="border-t border-line">
              <td className="py-2.5">{v.name}</td>
              <td className="uppercase text-xs">{v.role}</td>
              <td className="tabular-nums">{v.lat.toFixed(3)}</td>
              <td className="tabular-nums">{v.lon.toFixed(3)}</td>
              <td className="tabular-nums">{v.sog.toFixed(1)}</td>
              <td className="tabular-nums">{v.mmsi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SatPanel({ slick, gfwOn }: { slick: Slick; gfwOn: boolean }) {
  const scene = SAR_SCENES[slick.id];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-2 font-semibold">Sentinel-1 scene</h2>
        <p className="font-mono text-sm break-all">{scene?.item ?? slick.scene}</p>
        <p className="mt-3 text-sm text-muted">
          {slick.when.replace("T", " ").replace("Z", " UTC")} · {REGIONS[slick.region].label}
        </p>
        <p className="mt-2 text-sm">{slick.notes}</p>
      </section>
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-2 font-semibold">Detection</h2>
        <p className="text-sm text-muted">Class</p>
        <p className="font-medium">{slick.class}</p>
        <p className="mt-2 text-sm text-muted">Sheen</p>
        <p className="font-medium">
          {slick.lengthKm} km · {slick.areaKm2} km² · {(slick.confidence * 100).toFixed(0)}%
        </p>
        <p className="mt-2 text-sm text-muted">Identity feed</p>
        <p className="font-medium">{gfwOn ? "Global Fishing Watch live" : "Demo AIS corpus"}</p>
      </section>
    </div>
  );
}

export function AlertsPanel({
  rows,
  onOpen,
}: {
  rows: ReturnType<typeof alertsFor>;
  onOpen: (id: string) => void;
}) {
  if (!rows.length) {
    return (
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-2 font-semibold">Alerts</h2>
        <p className="text-sm text-muted">No slick currently clears the 78 / 78 source bar.</p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-line bg-card p-4">
      <h2 className="mb-1 font-semibold">Review queue</h2>
      <p className="mb-3 text-sm text-muted">
        Scene confidence ≥ 78% and a ranked source ≥ 78. Open to jump to attribution.
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((a) => (
          <li key={a.slick.id}>
            <button
              type="button"
              onClick={() => onOpen(a.slick.id)}
              className="w-full rounded-lg border border-line px-3 py-3 text-left text-sm hover:border-accent/50"
            >
              <span className="float-right tabular-nums text-good">{(a.score * 100).toFixed(0)}</span>
              <span className="font-medium">{a.slick.id}</span>
              <span className="mt-1 block text-xs text-muted">
                {a.top.vessel.name} · source · {REGIONS[a.slick.region].label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LayersPanel({
  layers,
  setLayers,
}: {
  layers: MapLayers;
  setLayers: (l: MapLayers) => void;
}) {
  const items: { key: keyof MapLayers; label: string }[] = [
    { key: "slick", label: "Oil slick sheen" },
    { key: "suspects", label: "Ranked suspects" },
    { key: "fleet", label: "AIS that passed the slick" },
    { key: "drift", label: "Drift forecast" },
  ];
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <h2 className="mb-2 font-semibold">Map layers</h2>
      <p className="mb-4 text-sm text-muted">Toggles apply to the live map without tearing it down.</p>
      <ul className="flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.key}>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={layers[it.key]}
                onChange={(e) => setLayers({ ...layers, [it.key]: e.target.checked })}
              />
              {it.label}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AnalyticsPanel({ stats }: { stats: ReturnType<typeof analytics> }) {
  const roles = [
    { name: "Source", n: stats.byRole.source },
    { name: "Transit", n: stats.byRole.transit },
    { name: "Near", n: stats.byRole.near },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-2 font-semibold">Scene confidence vs top score</h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.bars}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="id" tick={{ fill: "#8b9bb3", fontSize: 11 }} />
              <YAxis tick={{ fill: "#8b9bb3", fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="confidence" fill="#3b6dff" radius={4} />
              <Bar dataKey="top" fill="#c4232a" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-2 font-semibold">Roles across corpus</h2>
        <p className="mb-3 text-sm text-muted">
          {stats.slicks} slicks · mean confidence {stats.meanConf.toFixed(0)}%
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={roles} layout="vertical">
              <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#8b9bb3", fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#8b9bb3", fontSize: 11 }} width={70} />
              <Bar dataKey="n" fill="#8fd4ff" radius={4} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
