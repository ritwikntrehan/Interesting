import type { SourceId } from "../../contracts/src/index.ts";

export interface SourceCatalogEntry {
  id: SourceId; title: string; provider: string; homepage: string; api: string;
  license: string; attribution: string; cacheTtlSeconds: number; requestTimeoutMs: number;
  limitations: string[]; freshness: string;
}

export const SOURCE_CATALOG_VERSION = "2026-11-16";
export const SOURCE_CATALOG: Record<SourceId, SourceCatalogEntry> = {
  macrostrat: {
    id: "macrostrat", title: "Macrostrat integrated geologic map", provider: "Macrostrat",
    homepage: "https://macrostrat.org/", api: "https://macrostrat.org/api/v2/geologic_units/map",
    license: "CC BY 4.0", attribution: "Macrostrat and each cited original geologic map source",
    cacheTtlSeconds: 86400, requestTimeoutMs: 10000, freshness: "Upstream integrated map; provider update cadence varies by source map",
    limitations: ["A point lookup can return overlapping map compilations at multiple scales.", "The returned point geometry represents the query location, not a map-unit boundary."]
  },
  mrds: {
    id: "mrds", title: "Mineral Resource Data System (MRDS)", provider: "U.S. Geological Survey",
    homepage: "https://mrdata.usgs.gov/mrds/", api: "https://energy.usgs.gov/arcgis/rest/services/Hosted/Mineral_Resource_Data_System/FeatureServer/0",
    license: "U.S. Government public data; review source metadata", attribution: "U.S. Geological Survey MRDS and original record contributors",
    cacheTtlSeconds: 86400, requestTimeoutMs: 12000, freshness: "Historical compilation; not a current operations inventory",
    limitations: ["MRDS is historical occurrence data, not current mine status, reserves, ownership, production, or economic viability.", "Coverage outside the United States is incomplete."]
  },
  osm: {
    id: "osm", title: "OpenStreetMap mapped harbor infrastructure", provider: "OpenStreetMap contributors via Overpass",
    homepage: "https://www.openstreetmap.org/copyright", api: "https://overpass-api.de/api/interpreter",
    license: "ODbL 1.0", attribution: "© OpenStreetMap contributors",
    cacheTtlSeconds: 21600, requestTimeoutMs: 25000, freshness: "Community-edited; retrieval time is reported per query",
    limitations: ["Community-mapped infrastructure is not verified commercial throughput, navigability, operating status, or public accessibility.", "Results use a conservative tag allow-list and may omit relevant facilities."]
  },
  earthquakes: {
    id: "earthquakes", title: "USGS Earthquake Catalog", provider: "U.S. Geological Survey",
    homepage: "https://earthquake.usgs.gov/earthquakes/search/", api: "https://earthquake.usgs.gov/fdsnws/event/1/query",
    license: "U.S. Government public data; review USGS terms", attribution: "U.S. Geological Survey Earthquake Hazards Program",
    cacheTtlSeconds: 300, requestTimeoutMs: 10000, freshness: "Near-real-time catalog; events may be revised",
    limitations: ["Recent seismic observations are not a structural-geology interpretation, hazard forecast, or risk certification.", "Catalog parameters and event solutions may be updated after retrieval."]
  }
};

export const GLOBAL_LIMITATIONS = [
  "Results federate independent sources with different scopes, update schedules, precision, and completeness.",
  "Absence of a record does not establish absence of a feature or hazard.",
  "No result infers causality, ore grade, mine status, port capacity, accessibility, or economic viability."
];
