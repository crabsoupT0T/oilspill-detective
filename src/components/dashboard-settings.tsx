import { useState, type FormEvent } from "react";

function looksLikeAisKey(k: string) {
  return /^[a-f0-9]{32,64}$/i.test(k.trim());
}

export function SettingsPanel({
  gfwOn,
  last4,
  onStatus,
  aisOn,
  aisLast4,
  onAis,
}: {
  gfwOn: boolean;
  last4: string | null;
  onStatus: (on: boolean, last4: string | null) => void;
  aisOn: boolean;
  aisLast4: string | null;
  onAis: (on: boolean, last4: string | null) => void;
}) {
  const [token, setToken] = useState("");
  const [aisKey, setAisKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (looksLikeAisKey(token)) {
      setMsg("That looks like an AISStream key. Paste it in the AISStream box below, not GFW.");
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/gfw", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { error?: string; last4?: string; connected?: boolean };
      if (!res.ok) {
        setMsg(data.error ?? "Could not save token");
        return;
      }
      try {
        sessionStorage.setItem("gfw-key", token.trim());
      } catch {
        /* ignore */
      }
      setToken("");
      onStatus(true, data.last4 ?? null);
      setMsg("GFW token saved. Identity and AIS-off events will hydrate suspects.");
    } catch {
      setMsg("Network error saving token");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/gfw", { method: "DELETE", credentials: "include" });
      try {
        sessionStorage.removeItem("gfw-key");
      } catch {
        /* ignore */
      }
      onStatus(false, null);
      setMsg("GFW disconnected. Scoring is back on the demo corpus.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAis(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ais", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: aisKey }),
      });
      const data = (await res.json()) as { error?: string; last4?: string };
      if (!res.ok) {
        setMsg(data.error ?? "Could not save AISStream key");
        return;
      }
      try {
        sessionStorage.setItem("aisstream-key", aisKey.trim());
      } catch {
        /* ignore */
      }
      setAisKey("");
      onAis(true, data.last4 ?? null);
      setMsg("AISStream key saved. Header should read AIS live — refresh if it still says demo.");
    } catch {
      setMsg("Network error saving AISStream key");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectAis() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/ais", { method: "DELETE", credentials: "include" });
      try {
        sessionStorage.removeItem("aisstream-key");
      } catch {
        /* ignore */
      }
      onAis(false, null);
      setMsg("AISStream disconnected. Map uses demo lane traffic.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-1 font-semibold">Global Fishing Watch</h2>
        <p className="mb-4 text-sm text-muted">
          Identity and AIS-off events. Token stays on the server.{" "}
          <a className="underline decoration-white/20 hover:text-fg" href="https://globalfishingwatch.org/our-apis/" target="_blank" rel="noreferrer">
            Request a GFW access token
          </a>
          .
        </p>
        <p className="mb-3 text-sm">
          Status:{" "}
          <span className={gfwOn ? "text-good" : "text-muted"}>
            {gfwOn ? `connected ·••${last4 ?? ""}` : "demo corpus"}
          </span>
        </p>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => void save(e)}>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste GFW access token" aria-label="GFW access token" className="min-w-0 flex-1 rounded-lg border border-line bg-rail px-3 py-2 text-sm" />
          <button type="submit" disabled={busy || token.trim().length < 24} className="rounded-lg bg-accent px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Checking…" : "Save on server"}
          </button>
          {gfwOn && (
            <button type="button" disabled={busy} onClick={() => void disconnect()} className="rounded-lg border border-line px-4 py-2 text-sm">
              Disconnect
            </button>
          )}
        </form>
      </section>
      <section className="rounded-xl border border-line bg-card p-5">
        <h2 className="mb-1 font-semibold">AISStream live positions</h2>
        <p className="mb-4 text-sm text-muted">
          Coastal AIS via WebSocket — Hormuz, Med, Malacca, Gulf of Mexico, Black Sea. Key never leaves the server.{" "}
          <a className="underline decoration-white/20 hover:text-fg" href="https://aisstream.io/" target="_blank" rel="noreferrer">
            Create a free AISStream key
          </a>
          .
        </p>
        <p className="mb-3 text-sm">
          Status:{" "}
          <span className={aisOn ? "text-good" : "text-muted"}>
            {aisOn ? `connected ·••${aisLast4 ?? ""}` : "demo lanes"}
          </span>
        </p>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => void saveAis(e)}>
          <input type="password" autoComplete="off" value={aisKey} onChange={(e) => setAisKey(e.target.value)} placeholder="Paste AISStream API key" aria-label="AISStream API key" className="min-w-0 flex-1 rounded-lg border border-line bg-rail px-3 py-2 text-sm" />
          <button type="submit" disabled={busy || aisKey.trim().length < 8} className="rounded-lg bg-accent px-4 py-2 text-sm text-white disabled:opacity-50">
            {busy ? "Checking…" : "Save on server"}
          </button>
          {aisOn && (
            <button type="button" disabled={busy} onClick={() => void disconnectAis()} className="rounded-lg border border-line px-4 py-2 text-sm">
              Disconnect
            </button>
          )}
        </form>
        {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
        <p className="mt-4 text-xs text-muted">Associations are triage scores, not legal proof. Confirm on original SAR and AIS before acting.</p>
      </section>
    </div>
  );
}
