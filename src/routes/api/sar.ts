import { createFileRoute } from "@tanstack/react-router";
import type { RegionId } from "@/lib/oil-data";
import { latestSar } from "@/lib/sar.server";

const REGIONS: RegionId[] = ["hormuz", "med", "malacca", "gom", "black"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function GET({ request }: { request: Request }) {
  const region = new URL(request.url).searchParams.get("region") as RegionId | null;
  if (!region || !REGIONS.includes(region)) return json({ error: "unknown region" }, 400);
  const scene = await latestSar(region);
  if (!scene) return json({ item: null, when: null });
  return json(scene);
}

export const Route = createFileRoute("/api/sar")({
  server: { handlers: { GET } },
});
