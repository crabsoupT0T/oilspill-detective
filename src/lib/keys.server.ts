const AIS = "og_ais";
const GFW = "og_gfw";

function parse(request: Request): Record<string, string> {
  const raw = request.headers.get("cookie") ?? "";
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    const v = decodeURIComponent(part.slice(i + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

function setHeader(name: string, value: string) {
  const secure = "Secure; ";
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=2592000; HttpOnly; ${secure}SameSite=Lax`;
}

function clearHeader(name: string) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export function cookieAis(request: Request) {
  return parse(request)[AIS]?.trim() || request.headers.get("x-ais-key")?.trim() || undefined;
}

export function cookieGfw(request: Request) {
  return parse(request)[GFW]?.trim() || request.headers.get("x-gfw-key")?.trim() || undefined;
}

export function setAisCookie(token: string) {
  return setHeader(AIS, token);
}

export function setGfwCookie(token: string) {
  return setHeader(GFW, token);
}

export function clearAisCookie() {
  return clearHeader(AIS);
}

export function clearGfwCookie() {
  return clearHeader(GFW);
}
