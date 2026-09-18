import { REGIONS, SAR_SCENES, SLICKS, type Slick } from "./oil-data";
import { suspectsFor, type GfwHint, type Suspect } from "./scoring";

export type AlertRow = {
  slick: Slick;
  top: Suspect;
  score: number;
};

export function alertsFor(hints: GfwHint[] = []): AlertRow[] {
  const out: AlertRow[] = [];
  for (const slick of SLICKS) {
    const top = suspectsFor(slick, hints)[0];
    if (!top || top.role !== "source") continue;
    if (slick.confidence >= 0.78 && top.score >= 0.78) {
      out.push({ slick, top, score: top.score });
    }
  }
  return out.sort((a, b) => b.score * b.slick.confidence - a.score * a.slick.confidence);
}

export function analytics(hints: GfwHint[] = []) {
  const byRole = { source: 0, transit: 0, near: 0 };
  const bars = SLICKS.map((s) => {
    const list = suspectsFor(s, hints);
    for (const x of list) byRole[x.role] += 1;
    return {
      id: s.id.slice(-6),
      confidence: Math.round(s.confidence * 100),
      area: s.areaKm2,
      top: Math.round((list[0]?.score ?? 0) * 100),
    };
  });
  return { byRole, bars, slicks: SLICKS.length, meanConf: bars.reduce((a, b) => a + b.confidence, 0) / bars.length };
}

function esc(s: string) {
  const amp = String.fromCharCode(38);
  return s
    .split(amp)
    .join(amp + "amp;")
    .split("<")
    .join(amp + "lt;")
    .split(">")
    .join(amp + "gt;")
    .split('"')
    .join(amp + "quot;");
}

export function caseFileHtml(slick: Slick, suspects: Suspect[], gfwOn: boolean) {
  const top = suspects[0];
  const scene = SAR_SCENES[slick.id];
  const rows = suspects
    .slice(0, 8)
    .map(
      (s, i) =>
        `<tr><td>${i + 1}</td><td>${esc(s.vessel.name)}</td><td>${esc(s.role)}</td><td>${(s.score * 100).toFixed(0)}</td><td>${s.vessel.mmsi}</td><td>${esc(s.reasons[0] ?? "")}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(slick.id)} case file</title>
<style>
  body{font:14px/1.45 "IBM Plex Sans",system-ui,sans-serif;color:#122033;margin:32px;max-width:800px}
  h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:28px 0 8px}
  .muted{color:#5d6f86} table{width:100%;border-collapse:collapse} td,th{border-bottom:1px solid #d5deea;text-align:left;padding:8px 6px}
  .tag{display:inline-block;padding:2px 8px;border:1px solid #c4232a;color:#c4232a;border-radius:4px;font-size:11px;letter-spacing:.04em}
</style></head><body>
<p class="muted">OILGUARD AI · Marine Pollution Intelligence</p>
<h1>Case file ${esc(slick.id)}</h1>
<p class="muted">${esc(REGIONS[slick.region].label)} · SAR ${esc(slick.when.replace("T", " ").replace("Z", " UTC"))}</p>
<p><span class="tag">${esc(top?.role ?? "unscored")}</span> ${(slick.confidence * 100).toFixed(0)}% scene confidence · ${slick.areaKm2} km² · ${slick.lengthKm} km sheen · ${esc(slick.class)}</p>
<p>${esc(slick.notes)}</p>
<h2>Likely source</h2>
<p><strong>${esc(top?.vessel.name ?? "None")}</strong> · ${esc(top?.vessel.flag ?? "")} · ${esc(top?.vessel.class ?? "")} · MMSI ${esc(top?.vessel.mmsi ?? "—")}</p>
<p class="muted">${esc(top?.reasons.join(" · ") ?? "")}</p>
<h2>Ranked vessels</h2>
<table><thead><tr><th>#</th><th>Name</th><th>Role</th><th>Score</th><th>MMSI</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table>
<h2>Sources</h2>
<p class="muted">Sentinel-1 ${esc(scene?.item ?? slick.scene)} · AIS 72h rolling buffer${gfwOn ? " · Global Fishing Watch identity / AIS-off" : " · demo AIS corpus"}.</p>
<p class="muted">Triage scores are not legal proof. Confirm on original SAR and AIS before acting.</p>
</body></html>`;
}

export function downloadCase(slick: Slick, suspects: Suspect[], gfwOn: boolean) {
  const html = caseFileHtml(slick, suspects, gfwOn);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slick.id}-case.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function printCase(slick: Slick, suspects: Suspect[], gfwOn: boolean) {
  const html = caseFileHtml(slick, suspects, gfwOn);
  const w = window.open("", "_blank");
  if (!w) {
    downloadCase(slick, suspects, gfwOn);
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => w.print();
}
