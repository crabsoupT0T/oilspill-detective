import { createFileRoute } from "@tanstack/react-router";
import { clearGfwToken, enrichSlick, gfwStatus, saveGfwToken } from "@/lib/gfw.server";
import { clearGfwCookie, cookieGfw, setGfwCookie } from "@/lib/keys.server";

function json(body: unknown, status = 200, extra?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}

async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const cookie = cookieGfw(request);
  if (url.searchParams.get("slick")) {
    const slickId = url.searchParams.get("slick") ?? "";
    const result = await enrichSlick(slickId, cookie);
    return json(result);
  }
  return json(await gfwStatus(cookie));
}

async function POST({ request }: { request: Request }) {
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  const result = await saveGfwToken(body.token ?? "");
  if (!result.ok) return json({ error: result.error }, 400);
  return json(
    { ok: true, last4: result.last4, connected: true, source: "saved" },
    200,
    { "set-cookie": setGfwCookie(body.token!.trim()) },
  );
}

async function DELETE() {
  await clearGfwToken();
  return json(await gfwStatus(), 200, { "set-cookie": clearGfwCookie() });
}

export const Route = createFileRoute("/api/gfw")({
  server: { handlers: { GET, POST, DELETE } },
});
