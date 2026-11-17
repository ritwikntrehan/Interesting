import { BaseAdapter, ProviderError } from "./base.ts";
import { SOURCE_CATALOG } from "./catalog.ts";
import { stableRecordId, type CanonicalRecord, type QueryDefinition } from "../../contracts/src/index.ts";

interface MacroUnit { map_id: number; source_id: number; name: string; strat_name: string; lith: string; descrip: string; comments: string; t_age: number; b_age: number; best_int_name: string; scale: string }
interface MacroResponse { success?: { license: string; data: MacroUnit[]; refs?: Record<string, string> }; error?: unknown }

export class MacrostratAdapter extends BaseAdapter {
  id = "macrostrat" as const;
  async execute(input: QueryDefinition, signal: AbortSignal, retrievedAt: string): Promise<CanonicalRecord[]> {
    const url = new URL(SOURCE_CATALOG[this.id].api);
    url.searchParams.set("lat", String(input.lat)); url.searchParams.set("lng", String(input.lon));
    const body = await this.fetchJson<MacroResponse>(url.toString(), {}, signal);
    if (!body.success) throw new ProviderError("Macrostrat response did not contain success data");
    return body.success.data.slice(0, Math.min(input.limit, 25)).map((unit) => {
      const upstreamId = String(unit.map_id); const ref = body.success?.refs?.[String(unit.source_id)] ?? "Original map reference unavailable in response";
      return {
        id: stableRecordId(this.id, upstreamId), sourceId: this.id, datasetId: `macrostrat-map-source-${unit.source_id}`,
        datasetTitle: SOURCE_CATALOG[this.id].title, upstreamId, recordType: "geology" as const,
        geometry: { type: "Point" as const, coordinates: [input.lon, input.lat] },
        properties: { name: unit.name || "Unnamed map unit", stratigraphicName: unit.strat_name || null, lithology: unit.lith || null, description: unit.descrip || null, ageInterval: unit.best_int_name || null, topAgeMa: unit.t_age, bottomAgeMa: unit.b_age, mapScale: unit.scale, originalMapReference: ref },
        upstreamAttributes: { ...unit, original_map_reference: ref }, sourceUrl: `https://macrostrat.org/api/v2/geologic_units/map?lat=${input.lat}&lng=${input.lon}`,
        retrievedAt, observedAt: null, license: body.success!.license || SOURCE_CATALOG[this.id].license,
        attribution: `${SOURCE_CATALOG[this.id].attribution}. ${ref}`, coordinateQuality: { precision: "Query coordinate; map polygon not returned by this endpoint", flags: ["query-point-representation", `map-scale-${unit.scale}`] },
        transformationVersion: "1.0.0" as const, limitations: SOURCE_CATALOG[this.id].limitations
      };
    });
  }
}
