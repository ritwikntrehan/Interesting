import { BaseAdapter, ProviderError } from "./base.ts";
import { SOURCE_CATALOG } from "./catalog.ts";
import { stableRecordId, type CanonicalRecord, type QueryDefinition } from "../../contracts/src/index.ts";

interface OverpassElement { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }
interface OverpassResponse { elements?: OverpassElement[]; osm3s?: { timestamp_osm_base?: string } }

export class OsmAdapter extends BaseAdapter {
  id = "osm" as const;
  constructor(private endpoint = SOURCE_CATALOG.osm.api) { super(); }
  async execute(input: QueryDefinition, signal: AbortSignal, retrievedAt: string): Promise<CanonicalRecord[]> {
    if (input.radius_km > 100) throw new ProviderError("OpenStreetMap query radius is limited to 100 km to protect the public Overpass service", 422);
    const radius = Math.round(input.radius_km * 1000); const around = `(around:${radius},${input.lat},${input.lon})`;
    const query = `[out:json][timeout:20];(nwr${around}[harbour];nwr${around}[amenity=ferry_terminal];nwr${around}[industrial=port];nwr${around}[seamark:type=harbour];nwr${around}[man_made=pier][name];);out center tags qt ${input.limit};`;
    const body = await this.fetchJson<OverpassResponse>(this.endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: `data=${encodeURIComponent(query)}` }, signal);
    if (!body.elements) throw new ProviderError("Overpass response contained no elements");
    return body.elements.flatMap((element): CanonicalRecord[] => {
      const lat = element.lat ?? element.center?.lat; const lon = element.lon ?? element.center?.lon;
      if (lat === undefined || lon === undefined) return [];
      const upstreamId = `${element.type}/${element.id}`; const tags = element.tags ?? {};
      return [{
        id: stableRecordId(this.id, upstreamId), sourceId: this.id, datasetId: "openstreetmap-current", datasetTitle: SOURCE_CATALOG[this.id].title,
        upstreamId, recordType: "mapped_port", geometry: { type: "Point", coordinates: [lon, lat] },
        properties: { name: tags.name || tags["seamark:name"] || `${element.type} ${element.id}`, mappedTags: Object.fromEntries(Object.entries(tags).filter(([key]) => ["harbour", "amenity", "industrial", "seamark:type", "man_made", "operator", "access"].includes(key))) },
        upstreamAttributes: { element_type: element.type, id: element.id, tags }, sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        retrievedAt, observedAt: body.osm3s?.timestamp_osm_base ?? null, license: SOURCE_CATALOG[this.id].license, attribution: SOURCE_CATALOG[this.id].attribution,
        coordinateQuality: { precision: element.center ? "Element bounding-box center returned by Overpass" : "Mapped node coordinate", flags: element.center ? ["derived-center"] : [] }, transformationVersion: "1.0.0", limitations: SOURCE_CATALOG[this.id].limitations
      }];
    });
  }
}
