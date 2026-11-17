import { SOURCE_IDS, sanitizeQuery, type ContextEnvelope, type DataAdapter, type QueryDefinition, type SourceId } from "../../contracts/src/index.ts";
import { GLOBAL_LIMITATIONS, SOURCE_CATALOG_VERSION } from "../../adapters/src/catalog.ts";
import type { CacheRecord, QueryCache } from "./cache.ts";
export * from "./cache.ts";

export class FederationOrchestrator {
  constructor(private adapters: DataAdapter[], private cache?: QueryCache, private cacheTtlSeconds = 900, private staleTtlSeconds = 86400) {}

  async buildContext(rawInput: QueryDefinition, options: { bypassCache?: boolean; signal?: AbortSignal } = {}): Promise<ContextEnvelope> {
    const input = sanitizeQuery(rawInput); const key = this.cacheKey(input);
    let cached: CacheRecord | null = null;
    if (this.cache) {
      try {
        cached = await this.cache.get(key);
      } catch (error) {
        // A missing cache migration or transient D1 failure must not block live source queries.
        console.error(JSON.stringify({ event: "cache_read_error", message: error instanceof Error ? error.message : String(error) }));
      }
    }
    if (cached && !cached.stale && !options.bypassCache) return this.markCached(cached.value, cached.ageSeconds, false);
    const selected = this.adapters.filter((adapter) => input.sources.includes(adapter.id));
    const results = await Promise.all(selected.map((adapter) => adapter.query(input, { signal: options.signal })));
    const records = results.flatMap((result) => result.records);
    const allFailed = results.length > 0 && results.every((result) => ["unavailable", "unsupported"].includes(result.status.state));
    if (allFailed && cached) return this.markCached(cached.value, cached.ageSeconds, true);
    const bySource = Object.fromEntries(SOURCE_IDS.map((id) => [id, records.filter((record) => record.sourceId === id).length])) as Record<SourceId, number>;
    const envelope: ContextEnvelope = {
      apiVersion: "v1", query: { ...input, requestedAt: new Date().toISOString() }, statuses: results.map((result) => result.status),
      counts: { total: records.length, bySource },
      geojson: { type: "FeatureCollection", features: records.map((record) => ({ type: "Feature", id: record.id, geometry: record.geometry, properties: record })) },
      provenance: { transformationVersion: "1.0.0", sourceCatalogVersion: SOURCE_CATALOG_VERSION, deterministic: true }, limitations: GLOBAL_LIMITATIONS
    };
    if (this.cache) await this.cache.put(key, envelope, this.cacheTtlSeconds, this.staleTtlSeconds).catch(() => undefined);
    return envelope;
  }

  private cacheKey(input: QueryDefinition): string {
    return `context:v1:${input.lat}:${input.lon}:${input.radius_km}:${[...input.sources].sort().join(",")}:${input.min_magnitude}:${input.days}:${input.limit}`;
  }
  private markCached(value: ContextEnvelope, ageSeconds: number, stale: boolean): ContextEnvelope {
    const copy = structuredClone(value); copy.statuses = copy.statuses.map((status) => ({ ...status, state: stale ? "stale" : "cached", cacheAgeSeconds: ageSeconds, message: stale ? "Live providers unavailable; serving explicitly marked stale cache" : "Served from query cache" })); return copy;
  }
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const rad = (degrees: number) => degrees * Math.PI / 180; const dLat = rad(b[1] - a[1]); const dLon = rad(b[0] - a[0]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function boundingBoxes(lat: number, lon: number, radiusKm: number): Array<{ south: number; west: number; north: number; east: number }> {
  const latDelta = radiusKm / 111.32; const lonDelta = radiusKm / (111.32 * Math.max(Math.cos(lat * Math.PI / 180), 0.01));
  const south = Math.max(-90, lat - latDelta); const north = Math.min(90, lat + latDelta); let west = lon - lonDelta; let east = lon + lonDelta;
  if (west < -180) return [{ south, west: west + 360, north, east: 180 }, { south, west: -180, north, east }];
  if (east > 180) return [{ south, west, north, east: 180 }, { south, west: -180, north, east: east - 360 }];
  return [{ south, west, north, east }];
}
