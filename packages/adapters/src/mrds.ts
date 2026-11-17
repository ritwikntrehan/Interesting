import { BaseAdapter, ProviderError } from "./base.ts";
import { SOURCE_CATALOG } from "./catalog.ts";
import { stableRecordId, type CanonicalRecord, type Geometry, type QueryDefinition } from "../../contracts/src/index.ts";

interface ArcFeature { id?: number; geometry: Geometry; properties: { objectid_1?: number; dep_id?: string; site_name?: string; dev_stat?: string; code_list?: string; grade?: string } }
interface ArcResponse { type?: string; features?: ArcFeature[]; properties?: { exceededTransferLimit?: boolean }; error?: { message?: string } }

export class MrdsAdapter extends BaseAdapter {
  id = "mrds" as const;
  async execute(input: QueryDefinition, signal: AbortSignal, retrievedAt: string): Promise<CanonicalRecord[]> {
    const records: CanonicalRecord[] = []; const pageSize = Math.min(input.limit, 100); let offset = 0;
    while (records.length < input.limit) {
      const url = new URL(`${SOURCE_CATALOG[this.id].api}/query`);
      const params: Record<string, string> = { where: "1=1", geometry: `${input.lon},${input.lat}`, geometryType: "esriGeometryPoint", inSR: "4326", spatialRel: "esriSpatialRelIntersects", distance: String(input.radius_km), units: "esriSRUnit_Kilometer", outFields: "objectid_1,dep_id,site_name,dev_stat,code_list,grade", returnGeometry: "true", outSR: "4326", orderByFields: "objectid_1 ASC", resultRecordCount: String(Math.min(pageSize, input.limit - records.length)), resultOffset: String(offset), f: "geojson" };
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
      const body = await this.fetchJson<ArcResponse>(url.toString(), {}, signal);
      if (body.error || !body.features) throw new ProviderError(body.error?.message ?? "MRDS response contained no features");
      for (const feature of body.features) records.push(this.normalize(feature, retrievedAt));
      if (!body.properties?.exceededTransferLimit || body.features.length === 0) break;
      offset += body.features.length;
    }
    return records;
  }
  private normalize(feature: ArcFeature, retrievedAt: string): CanonicalRecord {
    const p = feature.properties; const upstreamId = p.dep_id || String(p.objectid_1 ?? feature.id);
    return {
      id: stableRecordId(this.id, upstreamId), sourceId: this.id, datasetId: "usgs-mrds-feature-layer-0", datasetTitle: SOURCE_CATALOG[this.id].title,
      upstreamId, recordType: "mineral_occurrence", geometry: feature.geometry,
      properties: { name: p.site_name || "Unnamed occurrence", developmentStatusReported: p.dev_stat || null, commodityCodes: p.code_list?.trim().split(/\s+/).filter(Boolean) ?? [], gradeFieldAsReported: p.grade || null },
      upstreamAttributes: { ...p }, sourceUrl: `https://mrdata.usgs.gov/mrds/show-mrds.php?dep_id=${encodeURIComponent(upstreamId)}`,
      retrievedAt, observedAt: null, license: SOURCE_CATALOG[this.id].license, attribution: SOURCE_CATALOG[this.id].attribution,
      coordinateQuality: { precision: null, flags: ["precision-not-published-in-feature-layer"] }, transformationVersion: "1.0.0", limitations: SOURCE_CATALOG[this.id].limitations
    };
  }
}
