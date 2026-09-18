import { createFileRoute } from "@tanstack/react-router";
import { aisStatus, clearAisToken, liveShips, saveAisToken } from "@/lib/ais-stream.server";
import { clearAisCookie, cookieAis, setAisCookie } from "@/lib/keys.server";
import type { RegionId } from "@/lib/oil-data";

const REGIONS: RegionId[] = ["hormuz", "med", "malacca", "gom", "black"];

function json(body: unknown, status = 200, extra?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}

async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const region = url.searchParams.get("region");
  const status = await aisStatus(cookieAis(request));
  if (region === "all") {
    return json({ ...status, live: liveShips("all") });
  }
  if (region && (REGIONS as string[]).includes(region)) {
    return json({ ...status, live: liveShips(region as RegionId) });
  }
  return json(status);
}

async function POST({ request }: { request: Request }) {
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const result = await saveAisToken(body.token ?? "");
  if (!result.ok) return json({ error: result.error }, 400);
  return json(
    { ok: true, last4: result.last4, connected: true, streaming: true, source: "saved" },
    200,
    { "set-cookie": setAisCookie(body.token!.trim()) },
  );
}

async function DELETE() {
  await clearAisToken();
  return json(await aisStatus(), 200, { "set-cookie": clearAisCookie() });
}

export const Route = createFileRoute("/api/ais")({
  server: { handlers: { GET, POST, DELETE } },
});
