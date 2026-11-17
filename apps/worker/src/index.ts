import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { createAdapters, SOURCE_CATALOG, SOURCE_CATALOG_VERSION } from "../../../packages/adapters/src/index.ts";
import { QuerySchema } from "../../../packages/contracts/src/index.ts";
import { D1QueryCache, FederationOrchestrator, MemoryQueryCache, type D1Like } from "../../../packages/orchestrator/src/index.ts";
import { analyzeContext, compareRegions } from "../../../packages/analytics/src/index.ts";
import { discoverComparison, discoverRegion } from "../../../packages/discovery/src/index.ts";
import { InterpretationError, InterpretationService } from "../../../packages/interpretation/src/index.ts";
import { PlaceSearchError, PlaceSearchService } from "../../../packages/geocoding/src/index.ts";
import { OPENAPI } from "./openapi.ts";
import { handleMcp } from "./mcp.ts";

export interface Env { CACHE?: D1Like; ASSETS?: { fetch(request: Request): Promise<Response> }; CACHE_TTL_SECONDS?: string; STALE_TTL_SECONDS?: string; OVERPASS_ENDPOINT?: string; GEOCODER_ENDPOINT?: string; ANTHROPIC_API_KEY?: string; ANTHROPIC_MODEL?: string }
type Variables = { orchestrator: FederationOrchestrator };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const fallbackCache = new MemoryQueryCache();
const rateBuckets = new Map<string, { start: number; count: number }>();
const metrics = { requests: 0, contextQueries: 0, providerFailures: 0, startedAt: new Date().toISOString() };
const interpretationBuckets = new Map<string, { start: number; count: number }>();
const InterpretSchema = QuerySchema.extend({ discovery_id: z.string().min(1).max(120), label: z.string().min(1).max(160).default("Selected region") });

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
app.get("/api/v1/analysis", async (c) => {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: { code: "INVALID_QUERY", message: "Query parameters failed validation", issues: parsed.error.issues } }, 400);
  const context = await c.get("orchestrator").buildContext(parsed.data, { signal: c.req.raw.signal });
  return c.json({ context, analysis: analyzeContext(context) });
});
app.get("/api/v1/discover", async (c) => {
  const parsed = QuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) return c.json({ error: { code: "INVALID_QUERY", message: "Query parameters failed validation", issues: parsed.error.issues } }, 400);
  const context = await c.get("orchestrator").buildContext(parsed.data, { signal: c.req.raw.signal });
  return c.json({ context, discovery: discoverRegion(context) });
});
app.post("/api/v1/interpret", async (c) => {
  const key = c.req.header("CF-Connecting-IP") || "local"; const now = Date.now(); const prior = interpretationBuckets.get(key); const bucket = !prior || now - prior.start >= 3600000 ? { start: now, count: 0 } : prior; bucket.count++; interpretationBuckets.set(key, bucket);
  if (bucket.count > 10) return c.json({ error: { code: "AI_RATE_LIMITED", message: "Maximum 10 optional interpretations per hour per edge isolate." } }, 429);
  const parsed = InterpretSchema.safeParse(await c.req.json().catch(() => ({}))); if (!parsed.success) return c.json({ error: { code: "INVALID_INTERPRETATION_REQUEST", message: "Valid query parameters and discovery_id are required", issues: parsed.error.issues } }, 400);
  const context = await c.get("orchestrator").buildContext(parsed.data, { signal: c.req.raw.signal }); const discovery = discoverRegion(context); const selected = discovery.discoveries.find((item) => item.id === parsed.data.discovery_id); if (!selected) return c.json({ error: { code: "DISCOVERY_NOT_FOUND", message: "The requested deterministic discovery was not produced for this query." } }, 404);
  try { return c.json(await new InterpretationService(c.env?.ANTHROPIC_API_KEY, c.env?.CACHE, c.env?.ANTHROPIC_MODEL).interpret(context, selected, parsed.data.label, c.req.raw.signal)); } catch (error) { if (error instanceof InterpretationError) return c.json({ error: { code: error.code, message: error.message } }, error.status as 429 | 502 | 503); throw error; }
});
app.get("/api/v1/compare", async (c) => {
  const params = new URL(c.req.url).searchParams; const shared = { radius_km: params.get("radius_km") ?? undefined, sources: params.get("sources") ?? undefined, min_magnitude: params.get("min_magnitude") ?? undefined, days: params.get("days") ?? undefined, limit: params.get("limit") ?? undefined };
  const a = QuerySchema.safeParse({ ...shared, lat: params.get("lat_a"), lon: params.get("lon_a") }); const b = QuerySchema.safeParse({ ...shared, lat: params.get("lat_b"), lon: params.get("lon_b") });
  if (!a.success || !b.success) return c.json({ error: { code: "INVALID_COMPARISON", message: "Both regions require valid lat_a, lon_a, lat_b, and lon_b parameters", issues: [...(!a.success ? a.error.issues : []), ...(!b.success ? b.error.issues : [])] } }, 400);
  const [contextA, contextB] = await Promise.all([c.get("orchestrator").buildContext(a.data, { signal: c.req.raw.signal }), c.get("orchestrator").buildContext(b.data, { signal: c.req.raw.signal })]);
  const regionA = analyzeContext(contextA); const regionB = analyzeContext(contextB); const comparison = compareRegions(regionA, regionB); return c.json({ labels: { regionA: params.get("label_a") || "Region A", regionB: params.get("label_b") || "Region B" }, contexts: { regionA: contextA, regionB: contextB }, comparison, discoveries: discoverComparison(comparison) });
});
app.get("/api/v1/places", async (c) => {
  try { const service = new PlaceSearchService(c.env?.CACHE, c.env?.GEOCODER_ENDPOINT); return c.json(await service.search(c.req.query("q") || "", c.req.raw.signal), 200, { "Cache-Control": "public, max-age=86400" }); }
  catch (error) { if (error instanceof PlaceSearchError) { const status = error.status === 400 ? 400 : error.status === 429 ? 429 : 502; return c.json({ error: { code: "PLACE_SEARCH_FAILED", message: error.message } }, status); } throw error; }
});
app.all("/mcp", (c) => handleMcp(c.req.raw, c.get("orchestrator")));
app.notFound(async (c) => c.env?.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404));
app.onError((error, c) => { console.error(JSON.stringify({ event: "request_error", message: error.message, path: c.req.path })); return c.json({ error: { code: "INTERNAL_ERROR", message: "Request failed" } }, 500); });

export default app;
