import assert from "node:assert/strict";
import test from "node:test";

import {
  createRateLimitHeaders,
  findRateLimitRule,
  getClientAddress,
  hashRateLimitKey,
} from "../lib/rate-limit.ts";

test("matches only protected POST endpoints", () => {
  assert.equal(findRateLimitRule("POST", "/api/auth/login")?.limit, 10);
  assert.equal(findRateLimitRule("post", "/api/auth/recover")?.windowSeconds, 3600);
  assert.equal(findRateLimitRule("GET", "/api/auth/login"), undefined);
  assert.equal(findRateLimitRule("POST", "/api/routes"), undefined);
});

test("prefers Cloudflare address and safely falls back", () => {
  assert.equal(getClientAddress(new Headers({ "cf-connecting-ip": "203.0.113.7" })), "203.0.113.7");
  assert.equal(getClientAddress(new Headers({ "cf-connecting-ip": " 203.0.113.8 " })), "203.0.113.8");
  assert.equal(getClientAddress(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" })), "198.51.100.1");
  assert.equal(getClientAddress(new Headers({ "x-forwarded-for": " 198.51.100.2 , 10.0.0.1" })), "198.51.100.2");
  assert.equal(getClientAddress(new Headers()), "unknown");
});

test("hashes bucket identifiers without retaining the client address", async () => {
  const first = await hashRateLimitKey("auth-login:203.0.113.7");
  const second = await hashRateLimitKey("auth-login:203.0.113.7");
  assert.equal(first, second);
  assert.equal(first.length, 64);
  assert.doesNotMatch(first, /203/);
});

test("reports standard rate limit metadata", () => {
  const rule = findRateLimitRule("POST", "/api/ocr");
  assert.ok(rule);
  const headers = createRateLimitHeaders(rule, 4, 12345, 12300);
  assert.equal(headers.get("RateLimit-Limit"), "10");
  assert.equal(headers.get("RateLimit-Remaining"), "6");
  assert.equal(headers.get("RateLimit-Reset"), "45");
});
