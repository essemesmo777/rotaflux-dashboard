/** Cloudflare Worker entry point for the vinext-starter template. */
import * as Sentry from "@sentry/cloudflare";
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  createRateLimitHeaders,
  findRateLimitRule,
  getClientAddress,
  hashRateLimitKey,
  type RateLimitRule,
} from "../lib/rate-limit";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

type RateLimitRow = {
  request_count: number;
  reset_at: number;
};

type RateLimitResult = {
  headers?: Headers;
  response?: Response;
};

async function applyRateLimit(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  rule: RateLimitRule,
  requestId: string,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const resetAt = now + rule.windowSeconds;
  const address = getClientAddress(request.headers);
  const bucketKey = await hashRateLimitKey(`${rule.id}:${address}`);

  try {
    const row = await env.DB.prepare(`
      INSERT INTO api_rate_limits (bucket_key, scope, request_count, reset_at, updated_at)
      VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(bucket_key) DO UPDATE SET
        request_count = CASE
          WHEN api_rate_limits.reset_at <= excluded.updated_at THEN 1
          ELSE api_rate_limits.request_count + 1
        END,
        reset_at = CASE
          WHEN api_rate_limits.reset_at <= excluded.updated_at THEN excluded.reset_at
          ELSE api_rate_limits.reset_at
        END,
        updated_at = excluded.updated_at
      RETURNING request_count, reset_at
    `).bind(bucketKey, rule.id, resetAt, now).first<RateLimitRow>();

    if (!row) throw new Error("Rate limit counter did not return a result");

    const headers = createRateLimitHeaders(rule, row.request_count, row.reset_at, now);
    if (requestId.startsWith("00")) {
      ctx.waitUntil(
        env.DB.prepare("DELETE FROM api_rate_limits WHERE reset_at < ?")
          .bind(now - 86400)
          .run()
          .catch((cleanupError: unknown) => {
            console.error(JSON.stringify({
              event: "rate_limit_cleanup_failed",
              message: cleanupError instanceof Error ? cleanupError.message : "unknown error",
            }));
          }),
      );
    }
    if (row.request_count <= rule.limit) return { headers };

    headers.set("Retry-After", String(Math.max(1, row.reset_at - now)));
    return {
      response: Response.json(
        { error: "Muitas tentativas. Aguarde antes de tentar novamente." },
        { status: 429, headers },
      ),
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "rate_limit_unavailable",
      scope: rule.id,
      message: error instanceof Error ? error.message : "unknown error",
    }));
    return {
      response: Response.json(
        { error: "Proteção temporariamente indisponível. Tente novamente em instantes." },
        { status: 503, headers: { "Retry-After": "30" } },
      ),
    };
  }
}

function traceSampleRate(env: Env): number {
  const value = Number(env.SENTRY_TRACES_SAMPLE_RATE ?? "0.05");
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0.05;
}

function withOperationalHeaders(response: Response, requestId: string, extra?: Headers): Response {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  extra?.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    let response: Response;
    let rateLimitHeaders: Headers | undefined;

    try {
      const rateLimitRule = findRateLimitRule(request.method, url.pathname);
      if (rateLimitRule) {
        const rateLimit = await applyRateLimit(request, env, ctx, rateLimitRule, requestId);
        if (rateLimit.response) {
          response = rateLimit.response;
          return withOperationalHeaders(response, requestId);
        }
        rateLimitHeaders = rateLimit.headers;
      }

      if (url.pathname === "/_vinext/image") {
        const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
        response = await handleImageOptimization(request, {
          fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
            return result.response();
          },
        }, allowedWidths);
      } else {
        response = await handler.fetch(request, env, ctx);
      }

      return withOperationalHeaders(response, requestId, rateLimitHeaders);
    } finally {
      console.log(JSON.stringify({
        event: "http_request",
        requestId,
        method: request.method,
        path: url.pathname,
        status: response?.status ?? 500,
        durationMs: Date.now() - startedAt,
      }));
    }
  },
};

export default Sentry.withSentry(
  (env: Env) => ({
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    environment: env.SENTRY_ENVIRONMENT ?? "production",
    tracesSampleRate: traceSampleRate(env),
    sendDefaultPii: false,
  }),
  worker,
);
