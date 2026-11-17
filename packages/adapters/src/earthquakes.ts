import { BaseAdapter, ProviderError } from "./base.ts";
import { SOURCE_CATALOG } from "./catalog.ts";
import { stableRecordId, type CanonicalRecord, type Geometry, type QueryDefinition } from "../../contracts/src/index.ts";

interface QuakeFeature { id: string; geometry: Geometry; properties: Record<string, unknown> & { time?: number; updated?: number; title?: string; place?: string; mag?: number; url?: string; status?: string } }
interface QuakeResponse { features?: QuakeFeature[]; metadata?: { status?: number } }

export class EarthquakeAdapter extends BaseAdapter {
  id = "earthquakes" as const;
  async execute(input: QueryDefinition, signal: AbortSignal, retrievedAt: string): Promise<CanonicalRecord[]> {
    const end = new Date(); const start = new Date(end.getTime() - input.days * 86400000);
    const url = new URL(SOURCE_CATALOG[this.id].api);
    const params: Record<string, string> = { format: "geojson", latitude: String(input.lat), longitude: String(input.lon), maxradiuskm: String(input.radius_km), minmagnitude: String(input.min_magnitude), starttime: start.toISOString(), endtime: end.toISOString(), limit: String(input.limit), orderby: "time" };
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const body = await this.fetchJson<QuakeResponse>(url.toString(), {}, signal);
    if (!body.features) throw new ProviderError("USGS response contained no feature collection");
    return body.features.map((feature) => ({
      id: stableRecordId(this.id, feature.id), sourceId: this.id, datasetId: "usgs-comcat", datasetTitle: SOURCE_CATALOG[this.id].title,
      upstreamId: feature.id, recordType: "earthquake" as const, geometry: feature.geometry,
      properties: { name: feature.properties.title || feature.properties.place || feature.id, magnitude: feature.properties.mag ?? null, place: feature.properties.place ?? null, reviewStatus: feature.properties.status ?? null, depthKm: feature.geometry.type === "Point" ? feature.geometry.coordinates[2] ?? null : null, updatedAt: typeof feature.properties.updated === "number" ? new Date(feature.properties.updated).toISOString() : null },
      upstreamAttributes: { ...feature.properties }, sourceUrl: String(feature.properties.url || `https://earthquake.usgs.gov/earthquakes/eventpage/${feature.id}`),
      retrievedAt, observedAt: typeof feature.properties.time === "number" ? new Date(feature.properties.time).toISOString() : null,
      license: SOURCE_CATALOG[this.id].license, attribution: SOURCE_CATALOG[this.id].attribution,
      coordinateQuality: { precision: null, flags: ["catalog-solution-subject-to-revision"] }, transformationVersion: "1.0.0" as const, limitations: SOURCE_CATALOG[this.id].limitations
    }));
  }
}
