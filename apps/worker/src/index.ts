import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAdapters, SOURCE_CATALOG, SOURCE_CATALOG_VERSION } from "../../../packages/adapters/src/index.ts";
import { QuerySchema } from "../../../packages/contracts/src/index.ts";
import { D1QueryCache, FederationOrchestrator, MemoryQueryCache, type D1Like } from "../../../packages/orchestrator/src/index.ts";
import { OPENAPI } from "./openapi.ts";
import { handleMcp } from "./mcp.ts";

export interface Env { CACHE?: D1Like; ASSETS?: { fetch(request: Request): Promise<Response> }; CACHE_TTL_SECONDS?: string; STALE_TTL_SECONDS?: string; OVERPASS_ENDPOINT?: string; ANTHROPIC_API_KEY?: string }
type Variables = { orchestrator: FederationOrchestrator };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const fallbackCache = new MemoryQueryCache();
const rateBuckets = new Map<string, { start: number; count: number }>();
const metrics = { requests: 0, contextQueries: 0, providerFailures: 0, startedAt: new Date().toISOString() };

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "DELETE", "OPTIONS"], allowHeaders: ["Content-Type", "mcp-session-id", "Last-Event-ID", "mcp-protocol-version"], exposeHeaders: ["mcp-session-id", "mcp-protocol-version", "X-RateLimit-Limit", "X-RateLimit-Remaining"] }));
app.use("*", async (c, next) => {
  metrics.requests++;
  const cache = c.env?.CACHE ? new D1QueryCache(c.env.CACHE) : fallbackCache;
  c.set("orchestrator", new FederationOrchestrator(createAdapters({ overpassEndpoint: c.env?.OVERPASS_ENDPOINT }), cache, Number(c.env?.CACHE_TTL_SECONDS || 900), Number(c.env?.STALE_TTL_SECONDS || 86400)));
  await next();
});
app.use("/api/v1/context", async (c, next) => {
  const key = c.req.header("CF-Connecting-IP") || "local"; const now = Date.now(); const prior = rateBuckets.get(key);
  const bucket = !prior || now - prior.start >= 60000 ? { start: now, count: 0 } : prior; bucket.count++; rateBuckets.set(key, bucket);
  c.header("X-RateLimit-Limit", "30"); c.header("X-RateLimit-Remaining", String(Math.max(0, 30 - bucket.count)));
  if (bucket.count > 30) return c.json({ error: { code: "RATE_LIMITED", message: "Maximum 30 context requests per minute per edge isolate." } }, 429);
  await next();
});

app.get("/api/v1/health", async (c) => {
  const deep = c.req.query("deep") === "true" || c.req.query("deep") === "1";
  const providers = deep ? Object.fromEntries(await Promise.all(createAdapters().map(async (adapter) => [adapter.id, await adapter.health()]))) : undefined;
  return c.json({ status: "ok", service: "world-data-federation", version: "1.0.0", time: new Date().toISOString(), cache: c.env?.CACHE ? "d1" : "memory", ...(providers ? { providers } : {}) });
});
app.get("/api/v1/sources", (c) => c.json({ version: SOURCE_CATALOG_VERSION, sources: Object.values(SOURCE_CATALOG) }));
app.get("/api/v1/metrics", (c) => c.json({ ...metrics, scope: "current Worker isolate; use Cloudflare observability for durable aggregate metrics" }));
app.get("/api/v1/openapi.json", (c) => c.json(OPENAPI));
app.get("/api/v1/context", async (c) => {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: { code: "INVALID_QUERY", message: "Query parameters failed validation", issues: parsed.error.issues } }, 400);
  const result = await c.get("orchestrator").buildContext(parsed.data, { signal: c.req.raw.signal });
  metrics.contextQueries++; metrics.providerFailures += result.statuses.filter((status) => status.state === "unavailable").length;
  return c.json(result, 200, { "Cache-Control": "public, max-age=60", "X-Content-Type-Options": "nosniff" });
});
app.all("/mcp", (c) => handleMcp(c.req.raw, c.get("orchestrator")));
app.notFound(async (c) => c.env?.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404));
app.onError((error, c) => { console.error(JSON.stringify({ event: "request_error", message: error.message, path: c.req.path })); return c.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, 500); });

export default app;
