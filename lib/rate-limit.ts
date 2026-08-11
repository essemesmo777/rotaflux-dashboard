export type RateLimitRule = {
  id: "auth-login" | "auth-recover" | "ocr";
  method: "POST";
  pathname: string;
  limit: number;
  windowSeconds: number;
};

const RATE_LIMIT_RULES: readonly RateLimitRule[] = [
  { id: "auth-login", method: "POST", pathname: "/api/auth/login", limit: 10, windowSeconds: 60 },
  { id: "auth-recover", method: "POST", pathname: "/api/auth/recover", limit: 3, windowSeconds: 3600 },
  { id: "ocr", method: "POST", pathname: "/api/ocr", limit: 10, windowSeconds: 600 },
];

export function findRateLimitRule(method: string, pathname: string): RateLimitRule | undefined {
  return RATE_LIMIT_RULES.find((rule) => rule.method === method.toUpperCase() && rule.pathname === pathname);
}

export function getClientAddress(headers: Headers): string {
  const cloudflareAddress = headers.get("cf-connecting-ip")?.trim();
  if (cloudflareAddress) return cloudflareAddress;

  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function hashRateLimitKey(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createRateLimitHeaders(
  rule: RateLimitRule,
  requestCount: number,
  resetAt: number,
  now = Math.floor(Date.now() / 1000),
): Headers {
  const headers = new Headers();
  headers.set("RateLimit-Limit", String(rule.limit));
  headers.set("RateLimit-Remaining", String(Math.max(0, rule.limit - requestCount)));
  headers.set("RateLimit-Reset", String(Math.max(0, resetAt - now)));
  return headers;
}
