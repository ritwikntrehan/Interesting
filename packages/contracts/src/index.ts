import { z } from "zod";

export const SOURCE_IDS = ["macrostrat", "mrds", "osm", "earthquakes"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];
export type SourceState = "live" | "cached" | "stale" | "unavailable" | "unsupported" | "partial";

export const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().positive().max(250).default(100),
  sources: z.string().optional().transform((value) => {
    if (!value) return [...SOURCE_IDS];
    const result = value.split(",").filter((item): item is SourceId => SOURCE_IDS.includes(item as SourceId));
    return result.length ? [...new Set(result)] : [...SOURCE_IDS];
  }),
  min_magnitude: z.coerce.number().min(-1).max(10).default(2.5),
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(500).default(250),
});

export type QueryDefinition = z.infer<typeof QuerySchema>;
export type Position = [number, number] | [number, number, number];
export type Geometry =
  | { type: "Point"; coordinates: Position }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPoint"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export interface CanonicalRecord {
  id: string;
  sourceId: SourceId;
  datasetId: string;
  datasetTitle: string;
  upstreamId: string;
  recordType: "geology" | "mineral_occurrence" | "mapped_port" | "earthquake";
  geometry: Geometry;
  properties: Record<string, unknown>;
  upstreamAttributes: Record<string, unknown>;
  sourceUrl: string;
  retrievedAt: string;
  observedAt: string | null;
  license: string;
  attribution: string;
  coordinateQuality: { precision: string | null; flags: string[] };
  transformationVersion: "1.0.0";
  limitations: string[];
}

export interface SourceStatus {
  sourceId: SourceId;
  state: SourceState;
  recordCount: number;
  retrievedAt: string;
  durationMs: number;
  cacheAgeSeconds?: number;
  message?: string;
  diagnostics?: { code: string; upstreamStatus?: number };
}

export interface ContextEnvelope {
  apiVersion: "v1";
  query: QueryDefinition & { requestedAt: string };
  statuses: SourceStatus[];
  counts: { total: number; bySource: Record<SourceId, number> };
  geojson: { type: "FeatureCollection"; features: Array<{ type: "Feature"; id: string; geometry: Geometry; properties: CanonicalRecord }> };
  provenance: { transformationVersion: "1.0.0"; sourceCatalogVersion: string; deterministic: true };
  limitations: string[];
}

export interface AdapterResult { records: CanonicalRecord[]; status: SourceStatus }
export interface DataAdapter {
  id: SourceId;
  query(input: QueryDefinition, options?: { signal?: AbortSignal }): Promise<AdapterResult>;
  health(): Promise<{ ok: boolean; latencyMs: number; message?: string }>;
}

export function stableRecordId(source: SourceId, upstreamId: string): string {
  return `${source}:${encodeURIComponent(upstreamId)}`;
}

export function sanitizeQuery(input: QueryDefinition): Omit<QueryDefinition, "sources"> & { sources: SourceId[] } {
  return { ...input, lat: round(input.lat, 6), lon: round(input.lon, 6), radius_km: round(input.radius_km, 2) };
}

const round = (value: number, places: number) => Number(value.toFixed(places));
